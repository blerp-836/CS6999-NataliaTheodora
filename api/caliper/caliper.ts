import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import CaliperValidator from './CaliperValidator';
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

let initialized = false;
const caliperv11SchemaDir = '/opt/caliper/v1_1';
const caliperv12SchemaDir = '/opt/caliper/v1_2';

let validatorv11: CaliperValidator;
let validatorv12: CaliperValidator;
let sqsClient: SQSClient;
let sqsInjestQueueUrl: string;

function initialize() {
  if (!initialized || process.env['underTest'] === 'true') {
    // Caliper Schema Validators
    validatorv11 = new CaliperValidator(caliperv11SchemaDir);
    validatorv12 = new CaliperValidator(caliperv12SchemaDir);

    // SQS queue settings
    const awsRegion = ensureEnvVar('AwsRegion');
    sqsClient = new SQSClient({ region: awsRegion });
    sqsInjestQueueUrl = ensureEnvVar('SQSInjestQueueUrl');

    initialized = true;
  }
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

        console.log('Validation errors:', validationErrors);
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

          // put the id and data on the SQS queue to be anonymized later
          await sendMessageToSQS({dataType: dataType, namespace: 'caliper', namespaceVersion: namespaceVersion, eventData: event });
        }

        // Send a success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'successfully validated caliper events',
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
async function sendMessageToSQS(data: RawData): Promise<string | undefined> {
  try {
    const params = {
      QueueUrl: sqsInjestQueueUrl,
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