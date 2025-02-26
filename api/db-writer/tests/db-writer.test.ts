import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { SQSClient } from '@aws-sdk/client-sqs';
import { lambdaHandler, processMessage, saveData, anonymizeEvent, RawData, CaliperEvent } from '../db-writer';
import { createDbConnection } from '../utils';

// Mock the dependencies
jest.mock('@aws-sdk/client-sqs');
jest.mock('../utils.ts', () => ({
  ensureEnvVar: jest.fn((name: string) => `mock_${name}`),
  createDbConnection: jest.fn(() => ({
    query: jest.fn().mockReturnValue({
      rows: [{ id: '123', create_date: new Date() }], // Match DB column name
    }),
    end: jest.fn(),
  })),
}));

const context: Context = {
  awsRequestId: 'mock-request-id',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'mock-function-name',
  functionVersion: 'mock-function-version',
  invokedFunctionArn: 'mock-invoked-function-arn',
  logGroupName: 'mock-log-group-name',
  logStreamName: 'mock-log-stream-name',
  memoryLimitInMB: 'mock-memory-limit',
  done: jest.fn(),
  fail: jest.fn(),
  getRemainingTimeInMillis: jest.fn(() => 0),
  succeed: jest.fn(),
};

describe('DB Writer Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('lambdaHandler', () => {
    it('should process messages successfully', async () => {
      const mockClient = {
        query: jest.fn().mockReturnValue({
          rows: [{ id: '123', create_date: new Date() }],
        }),
        end: jest.fn(),
      };
      (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

      const mockSQSResponse = { MessageId: 'mock-message-id' };
      (SQSClient as jest.Mock).mockImplementation(() => ({
        send: jest.fn<() => Promise<object>>().mockResolvedValue(mockSQSResponse),
      }));

      const testEvent: SQSEvent = {
        Records: [
          {
            messageId: '1',
            body: JSON.stringify({
              dataType: 'TEST',
              namespace: 'test',
              namespaceVersion: '1.0',
              eventData: { test: 'data' }, // SQS sends objects, parsed in processMessage
            }),
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: '',
            eventSource: '',
            eventSourceARN: '',
            awsRegion: '',
            receiptHandle: '',
          },
        ],
      };
      const response = await lambdaHandler(testEvent, context, jest.fn());

      expect(response?.batchItemFailures).toHaveLength(0);
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('should handle database connection failure', async () => {
      const dbError = new Error('DB Connection Failed');
      (createDbConnection as jest.Mock).mockImplementation(() => {
        throw dbError;
      });

      const testEvent: SQSEvent = {
        Records: [
          {
            messageId: '1',
            body: JSON.stringify({}),
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: '',
            eventSource: '',
            eventSourceARN: '',
            awsRegion: '',
            receiptHandle: '',
          },
        ],
      };
      const response = await lambdaHandler(testEvent, context, jest.fn());

      expect(response?.batchItemFailures).toHaveLength(1);
      expect(response?.batchItemFailures[0].itemIdentifier).toBe('1');
    });

    it('should handle invalid JSON in message body', async () => {
      const mockClient = {
        query: jest.fn(),
        end: jest.fn(),
      };
      (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

      const testEvent: SQSEvent = {
        Records: [
          {
            messageId: '1',
            body: 'invalid json',
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: '',
            eventSource: '',
            eventSourceARN: '',
            awsRegion: '',
            receiptHandle: '',
          },
        ],
      };

      const response = await lambdaHandler(testEvent, context, jest.fn());

      expect(response?.batchItemFailures).toHaveLength(1);
      expect(response?.batchItemFailures[0].itemIdentifier).toBe('1');
    });
  });

  describe('processMessage', () => {
    it('should successfully process a valid message', async () => {
      const mockClient = {
        query: jest.fn().mockReturnValue({
          rows: [{ id: '123', create_date: new Date() }],
        }),
      };
      (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

      const mockSQSResponse = { MessageId: 'mock-message-id' };
      (SQSClient as jest.Mock).mockImplementation(() => ({
        send: jest.fn<() => Promise<object>>().mockResolvedValue(mockSQSResponse),
      }));

      const testRecord: SQSRecord = {
        messageId: '1',
        body: JSON.stringify({
          dataType: 'TEST',
          namespace: 'test',
          namespaceVersion: '1.0',
          eventData: { test: 'data' },
        }),
        attributes: {} as any,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: '',
        eventSourceARN: '',
        awsRegion: '',
        receiptHandle: '',
      };

      const result = await processMessage(testRecord, mockClient as any);

      expect(result.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalled();
    });

    it('should handle database query errors', async () => {
      const mockClient = {
        query: jest.fn().mockImplementationOnce(() => Promise.reject(new Error('DB Error'))),
      };
      (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

      const testRecord: SQSRecord = {
        messageId: '1',
        body: JSON.stringify({
          dataType: 'TEST',
          namespace: 'test',
          namespaceVersion: '1.0',
          eventData: { test: 'data' },
        }),
        attributes: {} as any,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: '',
        eventSourceARN: '',
        awsRegion: '',
        receiptHandle: '',
      };

      const result = await processMessage(testRecord, mockClient as any);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('saveData', () => {
    it('should successfully save data to database', async () => {
      const mockClient = {
        query: jest.fn().mockReturnValue({
          rows: [{ id: '123', create_date: new Date() }],
        }),
      };
      (createDbConnection as jest.Mock).mockImplementation(() => mockClient);
  
      const testData: RawData = {
        id: '',
        dataType: 'TEST',
        namespace: 'test',
        namespaceVersion: '1.0',
        eventData: {
          test: 'data',
          actor: {
            id: '',
            type: '',
            name: undefined,
            email: undefined,
          },
          action: '',
          object: undefined,
          eventTime: '',
        }, // Now a CaliperEvent object
      };
  
      const result = await saveData(testData, mockClient as any);
  
      expect(result.id).toBe('123');
      expect(mockClient.query).toHaveBeenCalledWith(
        `
INSERT INTO test_raw_events 
(event, event_type, type_version) 
VALUES ($1, $2, $3)
RETURNING id, create_date`,
        [
          JSON.stringify({
            test: 'data',
            actor: { id: '', type: '' }, // Only serializable properties (no undefined)
            action: '',
            eventTime: '',
          }),
          testData.dataType,
          testData.namespaceVersion,
        ]
      );
    });


    it('should handle database errors', async () => {
      const mockClient = {
        query: jest.fn().mockImplementationOnce(() => Promise.reject(new Error('DB Error'))),
      };
      (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

      const testData: RawData = {
        id: '',
        dataType: 'TEST',
        namespace: 'test',
        namespaceVersion: '1.0',
        eventData: {
            test: 'data',
            actor: {
                id: '',
                type: '',
                name: undefined,
                email: undefined
            },
            action: '',
            object: undefined,
            eventTime: ''
        },
      };

      await expect(saveData(testData, mockClient as any)).rejects.toThrow('DB Error');
    });
  });

  describe('saveData with anonymization', () => {
    it('should save data with anonymized actor and original actor in extensions', async () => {
      const mockClient = {
        query: jest.fn().mockReturnValue({
          rows: [{ id: '456', create_date: new Date() }],
        }),
      };
      (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

      const mockSQSResponse = { MessageId: 'mock-message-id' };
      (SQSClient as jest.Mock).mockImplementation(() => ({
        send: jest.fn<() => Promise<object>>().mockResolvedValue(mockSQSResponse),
      }));

      // Sample Caliper event data
      const testEventData: CaliperEvent = {
        actor: {
          id: 'http://example.org/users/jdoe',
          type: 'Person',
          name: 'John Doe',
          email: 'jdoe@example.org',
        },
        action: 'Started',
        object: { id: 'http://example.org/assessments/123' },
        eventTime: '2025-02-22T10:00:00Z',
      };

      // SQS record with stringified RawData
      const testRecord: SQSRecord = {
        messageId: '1',
        body: JSON.stringify({
          id: '',
          dataType: 'CALIPER_EVENT',
          namespace: 'learning',
          namespaceVersion: '1.1',
          eventData: testEventData, // Object, will be stringified in body
        }),
        attributes: {} as any,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: '',
        eventSourceARN: '',
        awsRegion: '',
        receiptHandle: '',
      };

      // Run through processMessage to handle parsing and anonymization
      const processResult = await processMessage(testRecord, mockClient as any);

      expect(processResult.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        `
INSERT INTO learning_raw_events 
(event, event_type, type_version) 
VALUES ($1, $2, $3)
RETURNING id, create_date`,
        [
          expect.stringContaining('"actor":{"id":"'), // Check actor ID is hashed
          'CALIPER_EVENT',
          '1.1',
        ]
      );

      // Parse the saved event to verify
      const queryArgs = mockClient.query.mock.calls[0][1];
      const savedEventData = JSON.parse((queryArgs as [string, string, string])[0]);
      expect(savedEventData.actor.id).not.toBe('http://example.org/users/jdoe'); // Hashed
      expect(savedEventData.actor.name).toBeUndefined(); // PII removed
      expect(savedEventData.actor.email).toBeUndefined(); // PII removed
      expect(savedEventData.extensions.originalActor).toEqual(testEventData.actor); // Original preserved

      console.log('savedEventData:', savedEventData);
    });
  });
});
