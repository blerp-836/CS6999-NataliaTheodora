import * as crypto from 'crypto';
import { SQSHandler, SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';
import { ensureEnvVar, createDbConnection } from './utils';
import { Client } from 'pg';

let initialized = false;

// Initialize clients
let encryptionKey : string;

// RDS settings
let dbHost : string;
let dbPort : string;
let dbName : string;
let dbIamUser : string;
let awsRegion : string;

function initialize() {
  if (!initialized || process.env['underTest'] === 'true') {
        dbHost = ensureEnvVar('DBHost');
        dbPort = ensureEnvVar('DBPort');
        dbName = ensureEnvVar('DBName');
        dbIamUser = ensureEnvVar('DBIamUser');
        awsRegion = ensureEnvVar('AwsRegion');
        encryptionKey = ensureEnvVar('EncryptionKey');

        initialized = true;
    }
}

/**
 * AWS Lambda handler function that processes SQS events containing data that needs PII anonymization
 * @param {SQSEvent} event - The SQS event containing records to be processed
 * @returns {Promise<SQSBatchResponse>} Response containing any failed message IDs
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    initialize(); // for testing
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
interface ProcessResult {
    record: SQSRecord;
    success: boolean;
    /* eslint-disable  @typescript-eslint/no-explicit-any */
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
 * Processes an individual SQS message by parsing, anonymizing PII, and saving the data
 * @param {SQSRecord} record - Single SQS record to process
 * @param {Client} client - Object containing the DB connection to use 
 * @returns {Promise<ProcessResult>} Result of processing the message
 */
async function processMessage(record: SQSRecord, client: Client): Promise<ProcessResult> {
    try {
        const event = JSON.parse(record.body);
        findAndReplacePii(event);
        console.log('Successfully anonymized event:', JSON.stringify(event,null,2));
        await saveData(event, client);
        console.log('Successfully published event');
        
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
 * Entity representing a piece of PII data
 * @interface PIIEntity
 * @property {string} Type - Type of PII data
 * @property {number} BeginOffset - Starting position of PII in text
 * @property {number} EndOffset - Ending position of PII in text
 */
interface PIIEntity {
    Type: string;
    BeginOffset: number;
    EndOffset: number;
}

/**
 * Identifies PII data in text using regex patterns
 * @param {string} text - Text to scan for PII
 * @returns {PiiData} Object containing matched PII data by type
 */
export function identifyPII(text : string) : PiiData {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const phoneRegex = /(\+\d{1,2}\s?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g;
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  const creditCardNumberRegex = /\b(?:\d[ -]*?){13,16}\b/g;

  const emails = text.match(emailRegex);
  const phones = text.match(phoneRegex);
  const ssn = text.match(ssnRegex);
  const cc = text.match(creditCardNumberRegex);

  return { EMAIL: emails, 
           PHONE: phones,
           SSN: ssn,
           CREDIT_DEBIT_NUMBER: cc };
}

/**
 * Recursively searches through an object to find and replace PII data
 * @param {any} obj - Object to search for PII
 * @returns {void}
 */
export function findAndReplacePii(obj: any): void {
    // Handle arrays
    if (Array.isArray(obj)) {
        for (const item of obj) {
            findAndReplacePii(item);
        }
        return;
    }

    // Handle objects
    if (obj && typeof obj === 'object') {
        // Remove extensions.originalActor if it exists (Added in previous steps)
        if (obj.extensions && obj.extensions.originalActor) {
            delete obj.extensions.originalActor;
        }

        for (const key in obj) {
            if (key === 'actor') {
                continue; // Already anonymized in previous steps
            }
            if (typeof obj[key] === 'string') {
                const piiData = identifyPII(obj[key]);
                // loop through identified piiData and replace with anonymized text
                for (const piiDatakey in piiData) {
                    const piiType = piiDatakey as keyof PiiData;
                    if (piiData[piiType] && piiData[piiType] !== null) {
                        for (const pii of piiData[piiType]!) {
                            obj[key] = obj[key].replace(
                                pii, 
                                pseudonymizeData(obj[key], { 
                                    Type: piiType as keyof PiiData, 
                                    BeginOffset: obj[key].indexOf(pii), 
                                    EndOffset: obj[key].indexOf(pii) + pii.length 
                                })
                            );
                        }
                    }
                }
            } else if (typeof obj[key] === 'object') {
                findAndReplacePii(obj[key]);
            }
        }
    }
}

/**
 * Generates a pseudonymized version of PII data using HMAC
 * @param {string} text - Original text containing PII
 * @param {PIIEntity} entity - Object containing PII type and position information
 * @returns {string} Pseudonymized version of the PII data
 */
export const pseudonymizeData = (text: string, entity: PIIEntity): string => {
    const originalValue = text.slice(entity.BeginOffset, entity.EndOffset);
    initialize(); 
    const hmac = crypto.createHmac('sha256', encryptionKey!);
    hmac.update(`${entity.Type}:${originalValue}`);
    const hash = hmac.digest('hex');
    
    switch (entity.Type) {
        case 'PHONE':
            return `<RETACTED_PHONE>`;
        case 'EMAIL':
            return `${hash.substring(0, 8)}@pseudo.com`;
        case 'SSN':
            return `${hash.substring(0, 3)}-${hash.substring(3, 5)}-${hash.substring(5, 9)}`;
        case 'CREDIT_DEBIT_NUMBER':
            return `****-****-****-${hash.substring(0, 4)}`;
        default:
            return `REDACTED-${hash.substring(0, 8)}`;
    }
};

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
 * @param {Client} client - Object containing the DB connection to use 
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
async function saveData(data: RawData, client: Client): Promise<any> {

  // Prepare the INSERT query with parameterized values for security
  console.log(`Saving data to published-data database: ${data.namespace}_published_events`);
  const query = `
    INSERT INTO ${data.namespace}_published_events 
    (id, event, event_type, type_version) 
    VALUES ($1, $2, $3, $4)
    RETURNING id, create_date`;
  
  const values = [data.id, JSON.stringify(data.eventData), data.dataType, data.namespaceVersion];
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
