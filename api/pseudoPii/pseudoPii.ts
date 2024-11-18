import * as crypto from 'crypto';
import { SQSHandler, SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';
import { ensureEnvVar, createDbConnection } from './utils.ts';
import { Client } from 'pg';

// Initialize clients
const encryptionKey = ensureEnvVar('EncryptionKey');

// RDS settings
const dbHost = ensureEnvVar('DBHost');
const dbPort = ensureEnvVar('DBPort');
const dbName = ensureEnvVar('DBName');
const dbIamUser = ensureEnvVar('DBIamUser');
const awsRegion = ensureEnvVar('AwsRegion');

export const handler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

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

interface ProcessResult {
    record: SQSRecord;
    success: boolean;
    error?: any;
}

async function processBatch(records: SQSRecord[]): Promise<ProcessResult[]> {
    // Process messages in parallel and get all results
    const processPromises = records.map(record => processMessage(record));
    const results = await Promise.allSettled(processPromises);
    
    return results.map((result, index) => {
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            return {
                record: records[index],
                success: false,
                error: result.reason
            };
        }
    });
}

async function processMessage(record: SQSRecord): Promise<ProcessResult> {
    try {
        const event = JSON.parse(record.body);
        findAndReplacePii(event);
        console.log('Successfully anonymized event:', JSON.stringify(event,null,2));
        await saveData(event);
        
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

interface PiiData {
    EMAIL: RegExpMatchArray | null;
    PHONE: RegExpMatchArray | null;
    SSN: RegExpMatchArray | null;
    CREDIT_DEBIT_NUMBER: RegExpMatchArray | null;
}

interface PIIEntity {
    Type: string;
    BeginOffset: number;
    EndOffset: number;
}

function identifyPII(text : string) : PiiData {
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

function findAndReplacePii(obj: any): void {
    // Handle arrays
    if (Array.isArray(obj)) {
        for (let item of obj) {
            findAndReplacePii(item);
        }
        return;
    }

    // Handle objects
    if (obj && typeof obj === 'object') {
        for (let key in obj) {
            if (typeof obj[key] === 'string') {
                const piiData = identifyPII(obj[key]);
                // loop through identified piiData and replace with anonymized text
                for (let piiDatakey in piiData) {
                    let piiType = piiDatakey as keyof PiiData;
                    if (piiData[piiType]) {
                        for (let pii of piiData[piiType]) {
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

const pseudonymizeData = (text: string, entity: PIIEntity): string => {
    const originalValue = text.slice(entity.BeginOffset, entity.EndOffset);
    
    const hmac = crypto.createHmac('sha256', encryptionKey!);
    hmac.update(`${entity.Type}:${originalValue}`);
    const hash = hmac.digest('hex');
    
    switch (entity.Type) {
        case 'PHONE':
            return `+1${hash.substring(0, 10)}`;
        case 'EMAIL':
            return `${hash.substring(0, 8)}@pseudo.com`;
        case 'SSN':
            return `${hash.substring(0, 3)}-${hash.substring(3, 5)}-${hash.substring(5, 9)}`;
        case 'CREDIT_DEBIT_NUMBER':
            return `****-****-****-${hash.substring(0, 4)}`;
        default:
            return `PSEUDO-${hash.substring(0, 8)}`;
    }
};

interface RawData {
  id?: string;
  dataType: string;
  namespaceVersion: string;
  eventData: string;
}

/**
 * Saves data to the published_events table in the database.
 * 
 * @param {RawData} data - The data object to be stored
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
    client = await createDbConnection(dbHost, dbPort, dbName, dbIamUser, awsRegion);

    // Prepare the INSERT query with parameterized values for security
    const query = `
      INSERT INTO published_events 
      (id, event, event_type, type_version) 
      VALUES ($1, $2, $3, $4)
      RETURNING id, create_date`;
    
    const values = [data.id, JSON.stringify(data.eventData), data.dataType, data.namespaceVersion];
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
