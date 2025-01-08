import { SQSHandler, SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';
import { ensureEnvVar, createDbConnection } from './utils';
import { Client } from 'pg';
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

let initialized = false;

// RDS settings
let dbHost : string;
let dbPort : string;
let dbName : string;
let dbIamUser : string;
let awsRegion : string;

// SQS queue settings
let sqsClient : SQSClient;
let AnonymizeSQSQueueUrl : string;

function initialize() {
  if (!initialized || process.env['underTest'] === 'true') {
        dbHost = ensureEnvVar('DBHost');
        dbPort = ensureEnvVar('DBPort');
        dbName = ensureEnvVar('DBName');
        dbIamUser = ensureEnvVar('DBIamUser');
        awsRegion = ensureEnvVar('AwsRegion');
        sqsClient = new SQSClient({ region: awsRegion });
        AnonymizeSQSQueueUrl = ensureEnvVar('AnonymizeSQSQueueUrl');

        initialized = true;
    }
}

/**
 * AWS Lambda handler function that processes SQS events containing data that needs saved to the sensitive DB
 * @param {SQSEvent} event - The SQS event containing records to be processed
 * @returns {Promise<SQSBatchResponse>} Response containing any failed message IDs
 */
export const lambdaHandler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    initialize();
    try {
        // Process the batch of messages from the event
        const initialResults = await processBatch(event.Records);
        
        // Add failed messages to batchItemFailures
        initialResults.forEach(result => {
            if (!result.success) {
                batchItemFailures.push({
                    itemIdentifier: result.record.messageId
                });
            }
        });

    } catch (error) {
        console.error('Error in handler:', error);
        // In case of a critical error, fail all messages in the batch
        event.Records.forEach(record => {
            batchItemFailures.push({
                itemIdentifier: record.messageId
            });
        });
    }

    return {
        batchItemFailures
    };
};

/**
 * Result of processing an SQS record
 * @interface ProcessResult
 * @property {SQSRecord} record - The original SQS record
 * @property {boolean} success - Whether processing was successful
 * @property {any} [error] - Error information if processing failed
 */
export interface ProcessResult {
    record: SQSRecord;
    success: boolean;
    error?: any;
}

/**
 * Processes a batch of SQS records in parallel
 * @param {SQSRecord[]} records - Array of SQS records to process
 * @returns {Promise<ProcessResult[]>} Array of processing results for each record
 */
async function processBatch(records: SQSRecord[]): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];
    let client: Client | null = null;

    try {
      client = await createDbConnection(dbHost, dbPort, dbName, dbIamUser, awsRegion);
      console.log('Connected to the database');
    
      // Process messages sequentially
      for (const record of records) {
        try {
          const result = await processMessage(record, client);
          results.push(result);
        } catch (error) {
          results.push({
            record,
            success: false,
            error
          });
        }
      }
      return results;
    } catch (error) {
      console.error('Failed to connect to the database:', error);
      // Handle the error appropriately, e.g., by returning or throwing
      throw error;
    } finally {
      if (client) {
        await client.end();
      }
    }
}

/**
 * Processes an individual SQS message by saving the data to the sensitive DB and then place that message
 * on the anonymize queue
 * @param {SQSRecord} record - Single SQS record to process
 * @param {Client} Client - Object containing the DB connection to use 
 * @returns {Promise<ProcessResult>} Result of processing the message
 */
export async function processMessage(record: SQSRecord, client: Client): Promise<ProcessResult> {
    try {
        const event : RawData = JSON.parse(record.body);
        const saveResult = await saveData(event, client);
        console.log(`saving event: ${saveResult.status}`);

        // put the id and data on the SQS queue to be anonymized
        event.id = saveResult.id;
        await sendMessageToSQS(event);

        return {
            record,
            success: true
        };
        
    } catch (error) {
        console.error('Error processing message:', error, record);
        return {
            record,
            success: false,
            error
        };
    }
}

/**
 * Structure containing identified PII data
 * @interface PiiData
 * @property {RegExpMatchArray | null} EMAIL - Matched email addresses
 * @property {RegExpMatchArray | null} PHONE - Matched phone numbers
 * @property {RegExpMatchArray | null} SSN - Matched social security numbers
 * @property {RegExpMatchArray | null} CREDIT_DEBIT_NUMBER - Matched credit card numbers
 */
interface PiiData {
    EMAIL: RegExpMatchArray | null;
    PHONE: RegExpMatchArray | null;
    SSN: RegExpMatchArray | null;
    CREDIT_DEBIT_NUMBER: RegExpMatchArray | null;
}

/**
 * Raw event data structure for database storage
 * @interface RawData
 * @property {string} [id] - The assigned unique identifier (from raw_events in the sensitive-data db)
 * @property {string} dataType - Type of event data
 * @property {string} namespaceVersion - Version of the data schema
 * @property {string} eventData - JSON string containing event data
 */
interface RawData {
  id: string;
  dataType: string;
  namespace: string;
  namespaceVersion: string;
  eventData: string;
}

/**
 * Saves anonymized event data to the published-data database
 * @param {RawData} data - Object containing event data to be stored
 * @param {Client} Client - Object containing the DB connection to use 
 * @returns {Promise<any>} Object containing save status and record ID
 * @throws {Error} If database operations fail
 * @example
 * const data = {
 *   dataType: "USER_EVENT",
 *   namespaceVersion: "1.0",
 *   eventData: "{...}"
 * };
 * const result = await saveData(data);
 */
export async function saveData(data: RawData, client: Client): Promise<any> {

  // Prepare the INSERT query with parameterized values for security
  const query = `
    INSERT INTO ${data.namespace}_raw_events 
    (event, event_type, type_version) 
    VALUES ($1, $2, $3)
    RETURNING id, create_date`;
  
  const values = [JSON.stringify(data.eventData), data.dataType, data.namespaceVersion];
  const result = await client.query(query, values);

  return {
    status: JSON.stringify({
      message: '${data.namespace} data saved successfully',
      id: result.rows[0].id,
      timestamp: result.rows[0].created_at
    }),
    id: result.rows[0].id
  };
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

    console.log("Sent ${data.dataType} event ${data.Id} to SQS successfully:", response.MessageId);
    return response.MessageId;
  } catch (error) {
    console.error("Error sending message to SQS:", error);
    throw error;
  }
}