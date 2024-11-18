import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import CaliperValidator from './CaliperValidator.ts';
import fs from 'fs/promises';
import { Client, ClientConfig } from 'pg';
import { Signer } from "@aws-sdk/rds-signer";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// RDS settings
const dbHost = ensureEnvVar('DBHost');
const dbPort = ensureEnvVar('DBPort');
const dbName = ensureEnvVar('DBName');
const dbIamUser = ensureEnvVar('DBIamUser');
const awsRegion = ensureEnvVar('AwsRegion');

// Caliper Schema Validators
const caliperv11SchemaDir = '/opt/caliper/v1_1';
const validatorv11 = new CaliperValidator(caliperv11SchemaDir);
const caliperv12SchemaDir = '/opt/caliper/v1_2';
const validatorv12 = new CaliperValidator(caliperv12SchemaDir);

// SQS queue settings
const sqsClient = new SQSClient({ region: awsRegion });
const AnonymizeSQSQueueUrl = ensureEnvVar('AnonymizeSQSQueueUrl');

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // validate the body contains json data
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'The message body must contain a JSON document',
                }),
            };
        }

        // Validate the JSON object against the schema
        var data = JSON.parse(event.body);
        var namespaceVersion;
        var validationErrors;
        if (data.dataVersion.includes('v1p1')) {
            console.log('Caliper version is v1p1');
            namespaceVersion = 'v1p1';
            validationErrors = validatorv11.validateEnvelopeAndEvents(data);
        } else if (data.dataVersion.includes('v1p2')) {
            console.log('Caliper version is v1p2');
            namespaceVersion = 'v1p2';
            validationErrors = validatorv12.validateEnvelopeAndEvents(data);
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Invalid JSON',
                    errors: ['Caliper version must be v1p1 or v1p2'],
                }),
            };
        }

        if (validationErrors.length === 0) {
          console.log('Validation passed. No errors found.');
        } else {
          console.log('Validation failed.');
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: 'Invalid JSON',
              validationErrors
            }),
          };
        }

        // loop through the data and save each event to the database
        for (const [index, event] of data.data.entries()) {
          const dataType = event.type;
          const saveResult = await saveData({eventData: event, dataType: dataType, namespaceVersion: namespaceVersion});
          console.log(`saving event ${index}: ${saveResult.status}`);

          // put the id and data on the SQS queue to be anonymized later
          await sendMessageToSQS({ id: saveResult.id, dataType: dataType, namespaceVersion: namespaceVersion, eventData: event });
        }

        // Send a success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'hello caliper',
            }),
        };
    } catch (err) {
        console.log(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'some error happened',
            }),
        };
    }
};

/**
 * Ensures that a required environment variable is set and returns its value.
 * 
 * @param {string} name - The name of the environment variable to check
 * @returns {string} The value of the environment variable
 * @throws {Error} If the environment variable is not set or is empty
 * 
 * @example
 * try {
 *   const apiKey = ensureEnvVar('API_KEY');
 *   // Use apiKey...
 * } catch (error) {
 *   console.error('Missing required environment variable:', error.message);
 * }
 */
function ensureEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Retrieves an authentication token for database connection using AWS IAM authentication.
 * 
 * @returns {Promise<string>} A promise that resolves to the authentication token
 * @throws {Error} If token generation fails
 */
async function getAuthToken(): Promise<string> {
    const signer = new Signer({
      hostname: dbHost,
      port: parseInt(dbPort, 10),
      region: awsRegion,
      username: dbIamUser
    });
  
    return signer.getAuthToken();
  }
  
/**
 * Creates a new database connection using AWS IAM authentication.
 * 
 * @returns {Promise<Client>} A promise that resolves to a connected PostgreSQL client
 * @throws {Error} If connection creation fails
 */
async function createDbConnection(): Promise<Client> {
  const authToken = await getAuthToken();

  const clientConfig: ClientConfig = {
    host: dbHost,
    port: parseInt(dbPort, 10),
    database: dbName,
    user: dbIamUser,
    password: authToken,
    ssl: {
      rejectUnauthorized: false,
      ca: fs.readFile('/opt/ssl/rds-combined-ca-bundle.pem').toString(),
    }
  };
  const client = new Client(clientConfig);

  await client.connect();
  return client;
}

interface RawData {
  id?: string;
  dataType: string;
  namespaceVersion: string;
  eventData: string;
}
  
/**
 * Saves data to the raw_events table in the database.
 * 
 * @param {RawData} data - The data object to be stored
 * @param {string} dataType - The type of event being stored
 * @param {string} typeVersion - The version of the data type
 * @returns {Promise<Object>} A promise that resolves to an object containing:
 *   - status: JSON string with message, id, and timestamp
 * @throws {Error} If database operations fail
 * 
 * @example
 * try {
 *   const result = await saveData(
 *     { key: 'value' },
 *     'USER_EVENT',
 *     '1.0'
 *   );
 *   console.log(result.status);
 * } catch (error) {
 *   console.error('Failed to save data:', error);
 * }
 */
async function saveData(data: RawData): Promise<any> {
  let client: Client | null = null;

  try {
    client = await createDbConnection();

    // Prepare the INSERT query with parameterized values for security
    const query = `
      INSERT INTO raw_events 
      (event, event_type, type_version) 
      VALUES ($1, $2, $3)
      RETURNING id, create_date`;
    
    const values = [JSON.stringify(data.eventData), data.dataType, data.namespaceVersion];
    const result = await client.query(query, values);

    return {
      status: JSON.stringify({
        message: 'Data saved successfully',
        id: result.rows[0].id,
        timestamp: result.rows[0].created_at
      }),
      id: result.rows[0].id
    };

  } catch (error) {
    console.error('Database error:', error);
    
    // More specific error handling
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

  } finally {
    if (client) {
      await client.end();
    }
  }
}

/**
 * Sends a message to an SQS queue.
 * 
 * @param {RawData} data - The data object to be sent to SQS
 * @returns {Promise<string>} A promise that resolves to the MessageId of the sent message.
 * @throws {Error} If there's an error sending the message or if the queue URL is not set.
 * 
 * @example
 * try {
 *   const messageId = await sendMessageToSQS('12345', data);
 *   console.log('Message sent successfully:', messageId);
 * } catch (error) {
 *   console.error('Failed to send message to SQS:', error);
 * }
 */
async function sendMessageToSQS(data: RawData): Promise<string | undefined> {
  try {
    const params = {
      QueueUrl: AnonymizeSQSQueueUrl,
      MessageBody: JSON.stringify(data)
    };

    const command = new SendMessageCommand(params);
    const response = await sqsClient.send(command);

    console.log("Sent saveId to SQS successfully:", response.MessageId);
    return response.MessageId;
  } catch (error) {
    console.error("Error sending message to SQS:", error);
    throw error;
  }
}