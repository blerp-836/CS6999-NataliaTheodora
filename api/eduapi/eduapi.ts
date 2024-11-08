import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import Ajv2019 from "ajv/dist/2019";
import { Client, ClientConfig } from 'pg';
import { Signer } from "@aws-sdk/rds-signer";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// RDS settings
const dbHost = ensureEnvVar('DBHost');
const dbPort = ensureEnvVar('DBPort');
const dbName = ensureEnvVar('DBName');
const dbIamUser = ensureEnvVar('DBIamUser');
const awsRegion = ensureEnvVar('AwsRegion');

// SQS queue settings
const sqsClient = new SQSClient({ region: awsRegion });
const AnonymizeSQSQueueUrl = ensureEnvVar('AnonymizeSQSQueueUrl');

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

        // verify the necessary path parameters were sent
        if (!event.pathParameters || !event.pathParameters.schema || !event.pathParameters.version) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'The request URI is missing path parameters; schema and/or version.',
                }),
            };
        }

        // get the schema name and version from the path parameters
        const schemaName = event.pathParameters.schema;
        const schemaVersion = event.pathParameters.version;
        const schemaFile = '/opt/eduapi/' + schemaVersion + '/' + schemaName + '.json';

        // validate the schema file exists
        try {
            await fs.access(schemaFile);
        } catch (err) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'The specified schema/version not found',
                }),
            };
        }
        
        // Validate the JSON object against the schema
        console.log('validating data for schemaName: ', schemaName);
        var data = JSON.parse(event.body);
        const { valid, errors } = await validateJsonWithSchema(data, schemaFile);
        if (!valid) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Invalid JSON',
                    errors,
                }),
            };
        } else {
            console.log('JSON is valid');
        }

        // Save the data to the database
        const saveResult = await saveData(data, schemaName, schemaVersion);
        console.log(saveResult.status);
        
        // put the id on the SQS queue to be anonymized later
        await sendMessageToSQS(saveResult.id);

        // Send a success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'hello eduapi',
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
 * Validates a JSON object against a JSON schema.
 *
 * @param {unknown} jsonObject - The JSON object to validate.
 * @param {string} schemaPath - The path to the JSON schema file.
 * @returns {Promise<{ valid: boolean; errors: string[] | null }>} - A promise that resolves to an object indicating whether the JSON object is valid and any validation errors.
 */

async function validateJsonWithSchema<T>(jsonObject: unknown, schemaPath: string): Promise<{ valid: boolean; errors: string[] | null }> {
    try {
      // Read the schema file
      const schemaContent = await fs.readFile(schemaPath, 'utf-8');
      const schema: JSONSchemaType<T> = JSON.parse(schemaContent);
  
      // Create Ajv instance
      const ajv = new Ajv2019({ allErrors: true });
      //const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);
  
      // Compile the schema
      const validate = ajv.compile(schema);
  
      // Validate the JSON object
      const valid = validate(jsonObject);
  
      if (valid) {
        return { valid: true, errors: null };
      } else {
        const errors = validate.errors?.flatMap(error => `${error.instancePath} ${error.message}`) || [];
        return { valid: false, errors };
      }
    } catch (error) {
      console.error('Error validating JSON:', error);
      return { valid: false, errors: ['An error occurred during validation'] };
    }
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
  // define important keys from the schema here
  [key: string]: any;
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
async function saveData(data: RawData, dataType: string, typeVersion: string): Promise<any> {
  let client: Client | null = null;

  try {
    client = await createDbConnection();

    // Prepare the INSERT query with parameterized values for security
    const query = `
      INSERT INTO raw_events 
      (event, event_type, type_version) 
      VALUES ($1, $2, $3)
      RETURNING id, create_date`;
    
    const values = [JSON.stringify(data), dataType, typeVersion];
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
 * @param {string} saveId - The ID of the saved data to be sent in the message
 * @returns {Promise<string>} A promise that resolves to the MessageId of the sent message.
 * @throws {Error} If there's an error sending the message or if the queue URL is not set.
 * 
 * @example
 * try {
 *   const messageId = await sendMessageToSQS('12345');
 *   console.log('Message sent successfully:', messageId);
 * } catch (error) {
 *   console.error('Failed to send message to SQS:', error);
 * }
 */
async function sendMessageToSQS(saveId: string): Promise<string | undefined> {
  try {
    const params = {
      QueueUrl: AnonymizeSQSQueueUrl,
      MessageBody: JSON.stringify({ id: saveId })
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