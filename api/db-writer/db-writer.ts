import { SQSHandler, SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';
import { ensureEnvVar, createDbConnection } from './utils';
import { Client } from 'pg';
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { createHash } from 'crypto';

let initialized = false;

// RDS settings
let dbHost: string;
let dbPort: string;
let dbName: string;
let dbIamUser: string;
let awsRegion: string;

// SQS queue settings
let sqsClient: SQSClient;
let AnonymizeSQSQueueUrl: string;

// Hashing configuration
const HASH_ALGORITHM = 'sha256';
const SALT = process.env['HASH_SALT'] || 'your-secret-salt';

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

export interface CaliperEvent {
  actor: {
    id: string;
    type: string;
    name?: string;
    email?: string;
    [key: string]: any;
  };
  action: string;
  object: any;
  eventTime: string;
  extensions?: {
    originalActor?: any;
    [key: string]: any;
  };
  [key: string]: any;
}

function hashUserId(userId: string): string {
  return createHash(HASH_ALGORITHM)
    .update(userId + SALT)
    .digest('hex');
}

export function anonymizeEvent(event: CaliperEvent): CaliperEvent {
  const anonymizedEvent = { ...event };
  if (!anonymizedEvent.extensions) {
    anonymizedEvent.extensions = {};
  }
  anonymizedEvent.extensions.originalActor = { ...anonymizedEvent.actor };
  if (anonymizedEvent.actor?.id) {
    anonymizedEvent.actor = {
      ...anonymizedEvent.actor,
      id: hashUserId(anonymizedEvent.actor.id),
    };
    delete anonymizedEvent.actor.name;
    delete anonymizedEvent.actor.email;
    delete anonymizedEvent.actor.description;
  }
  return anonymizedEvent;
}

export const lambdaHandler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  initialize();
  try {
    const initialResults = await processBatch(event.Records);
    initialResults.forEach(result => {
      if (!result.success) {
        batchItemFailures.push({ itemIdentifier: result.record.messageId });
      }
    });
  } catch (error) {
    console.error('Error in handler:', error);
    event.Records.forEach(record => {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    });
  }
  return { batchItemFailures };
};

export interface ProcessResult {
  record: SQSRecord;
  success: boolean;
  error?: any;
}

async function processBatch(records: SQSRecord[]): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  let client: Client | null = null;
  try {
    client = await createDbConnection(dbHost, dbPort, dbName, dbIamUser, awsRegion);
    console.log('Connected to the database');
    for (const record of records) {
      try {
        const result = await processMessage(record, client);
        results.push(result);
      } catch (error) {
        results.push({ record, success: false, error });
      }
    }
    return results;
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    throw error;
  } finally {
    if (client) await client.end();
  }
}

export async function processMessage(record: SQSRecord, client: Client): Promise<ProcessResult> {
  try {
    const event = JSON.parse(record.body) as RawData;
    if (typeof event.eventData === 'string') {
      event.eventData = JSON.parse(event.eventData); 
    }
    const anonymizedEventData = anonymizeEvent(event.eventData);
    event.eventData = anonymizedEventData
    const saveResult = await saveData(event, client);
    console.log(`saving event: ${saveResult.status}`);
    event.id = saveResult.id;
    await sendMessageToSQS(event);
    return { record, success: true };
  } catch (error) {
    console.error('Error processing message:', error, record);
    return { record, success: false, error };
  }
}

export interface RawData {
  id?: string;
  dataType: string;
  namespace: string;
  namespaceVersion: string;
  eventData: CaliperEvent;
}

export async function saveData(data: RawData, client: Client): Promise<any> {
  const query = `
INSERT INTO ${data.namespace}_raw_events 
(event, event_type, type_version) 
VALUES ($1, $2, $3)
RETURNING id, create_date`;
  const values = [JSON.stringify(data.eventData), data.dataType, data.namespaceVersion];
  const result = await client.query(query, values);
  return {
    status: JSON.stringify({
      message: `${data.namespace} data saved successfully`,
      id: result.rows[0].id,
      timestamp: result.rows[0].create_date
    }),
    id: result.rows[0].id
  };
}

async function sendMessageToSQS(data: RawData): Promise<string | undefined> {
  try {
    const params = {
      QueueUrl: AnonymizeSQSQueueUrl,
      MessageBody: JSON.stringify(data),
    };
    const command = new SendMessageCommand(params);
    const response = await sqsClient.send(command);
    console.log(`Sent ${data.dataType} event ${data.id} to SQS successfully:`, response.MessageId);
    return response.MessageId;
  } catch (error) {
    console.error("Error sending message to SQS:", error);
    throw error;
  }
}