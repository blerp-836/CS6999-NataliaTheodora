import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import Ajv2019 from "ajv/dist/2019";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

let initialized = false;

// SQS queue settings
let awsRegion : string;
let sqsClient : SQSClient;
let SQSInjestQueueUrl : string;

function initialize() {
  if (!initialized || process.env['underTest'] === 'true') {
    // SQS queue settings
    awsRegion = ensureEnvVar('AwsRegion');
    sqsClient = new SQSClient({ region: awsRegion });
    SQSInjestQueueUrl = ensureEnvVar('SQSInjestQueueUrl');

    initialized = true;
  }
}

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
export function ensureEnvVar(name: string): string {
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
    initialize();

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
        const dataType = event.pathParameters.schema;
        const namespaceVersion = event.pathParameters.version;
        const schemaFile = '/opt/eduapi/' + namespaceVersion + '/' + dataType + '.json';

        // validate the schema file exists
        try {
            await fs.access(schemaFile);
        } catch (err) {
            console.error('Schema file not found: ', schemaFile);
            console.error(err);
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'The specified schema/version not found',
                }),
            };
        }
        
        // Validate the JSON object against the schema
        console.log('validating data for dataType: ', dataType);
        const data = JSON.parse(event.body);
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

        // put the id and data on the SQS queue to be injested to the DB
        await sendMessageToSQS({ dataType: dataType, namespace: 'eduapi', namespaceVersion: namespaceVersion, eventData: data });

        // Send a success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'successfully validated eduapi event',
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

export async function validateJsonWithSchema<T>(jsonObject: unknown, schemaPath: string): Promise<{ valid: boolean; errors: string[] | null }> {
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

interface RawData {
  id?: string;
  dataType: string;
  namespace: string;
  namespaceVersion: string;
  eventData: string;
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
export async function sendMessageToSQS(data: RawData): Promise<string | undefined> {
  try {
    const params = {
      QueueUrl: SQSInjestQueueUrl,
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