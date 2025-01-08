import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals'
import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { SQSClient } from "@aws-sdk/client-sqs";
import { lambdaHandler, processMessage, saveData } from '../db-writer';
import { createDbConnection } from '../utils';

// Mock the dependencies
jest.mock('@aws-sdk/client-sqs');
jest.mock('../utils.ts', () => ({
    ensureEnvVar: jest.fn((name: string) => `mock_${name}`),
    createDbConnection: jest.fn( () => ({
        query: jest.fn().mockReturnValue({
            rows: [{ id: '123', created_at: new Date() }]
        }),
        end: jest.fn()
    }))
}));

const context : Context = {
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
    succeed: jest.fn()
};


describe('DB Writer Lambda', () => {
    // Setup before each test
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('lambdaHandler', () => {
        it('should process messages successfully', async () => {
            // Mock successful DB connection
            const mockClient = {
                query: jest.fn().mockReturnValue({
                    rows: [{ id: '123', created_at: new Date() }]
                }),
                end: jest.fn()
            };
            (createDbConnection as jest.Mock).mockImplementation(() => mockClient);
            
            // Mock SQS client
            const mockSQSResponse = { MessageId: 'mock-message-id' };
            (SQSClient as jest.Mock).mockImplementation(() => ({
                send: jest.fn<() => Promise<object>>().mockResolvedValue(mockSQSResponse)
            }));

            // Create test event
            const testEvent: SQSEvent = {
                Records: [{
                    messageId: '1',
                    body: JSON.stringify({
                        dataType: 'TEST',
                        namespace: 'test',
                        namespaceVersion: '1.0',
                        eventData: '{"test": "data"}'
                    }),
                    attributes: {} as any,
                    messageAttributes: {},
                    md5OfBody: '',
                    eventSource: '',
                    eventSourceARN: '',
                    awsRegion: '',
                    receiptHandle: ''
                }]
            };
            const response = await lambdaHandler(testEvent, context, jest.fn());

            expect(response?.batchItemFailures).toHaveLength(0);
            expect(mockClient.query).toHaveBeenCalled();
            expect(mockClient.end).toHaveBeenCalled();
        });

        it('should handle database connection failure', async () => {
            // Mock DB connection failure
            const dbError = new Error('DB Connection Failed');
            (createDbConnection as jest.Mock).mockImplementation(() => { throw dbError });

            const testEvent: SQSEvent = {
                Records: [{
                    messageId: '1',
                    body: JSON.stringify({}),
                    attributes: {} as any,
                    messageAttributes: {},
                    md5OfBody: '',
                    eventSource: '',
                    eventSourceARN: '',
                    awsRegion: '',
                    receiptHandle: ''
                }]
            };
            const response = await lambdaHandler(testEvent, context, jest.fn());

            expect(response?.batchItemFailures).toHaveLength(1);
            expect(response?.batchItemFailures[0].itemIdentifier).toBe('1');
        });

        it('should handle invalid JSON in message body', async () => {
            // Mock successful DB connection
            const mockClient = {
                query: jest.fn(),
                end: jest.fn()
            };
            (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

            const testEvent: SQSEvent = {
                Records: [{
                    messageId: '1',
                    body: 'invalid json',
                    attributes: {} as any,
                    messageAttributes: {},
                    md5OfBody: '',
                    eventSource: '',
                    eventSourceARN: '',
                    awsRegion: '',
                    receiptHandle: ''
                }]
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
                    rows: [{ id: '123', created_at: new Date() }]
                })
            };
            (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

            // Mock SQS client
            const mockSQSResponse = { MessageId: 'mock-message-id' };
            (SQSClient as jest.Mock).mockImplementation(() => ({
                send: jest.fn<() => Promise<object>>().mockResolvedValue(mockSQSResponse)
            }));

            const testRecord: SQSRecord = {
                messageId: '1',
                body: JSON.stringify({
                    dataType: 'TEST',
                    namespace: 'test',
                    namespaceVersion: '1.0',
                    eventData: '{"test": "data"}'
                }),
                attributes: {} as any,
                messageAttributes: {},
                md5OfBody: '',
                eventSource: '',
                eventSourceARN: '',
                awsRegion: '',
                receiptHandle: ''
            };

            const result = await processMessage(testRecord, mockClient as any);

            expect(result.success).toBe(true);
            expect(mockClient.query).toHaveBeenCalled();
        });

        it('should handle database query errors', async () => {
            const mockClient = {
                query: jest.fn().mockImplementationOnce( () => Promise.reject(new Error('DB Error')) )
            };
            (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

            const testRecord: SQSRecord = {
                messageId: '1',
                body: JSON.stringify({
                    dataType: 'TEST',
                    namespace: 'test',
                    namespaceVersion: '1.0',
                    eventData: '{"test": "data"}'
                }),
                attributes: {} as any,
                messageAttributes: {},
                md5OfBody: '',
                eventSource: '',
                eventSourceARN: '',
                awsRegion: '',
                receiptHandle: ''
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
                    rows: [{ id: '123', created_at: new Date() }]
                })
            };
            (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

            const testData = {
                id: '',
                dataType: 'TEST',
                namespace: 'test',
                namespaceVersion: '1.0',
                eventData: '{"test": "data"}'
            };

            const result = await saveData(testData, mockClient as any);

            expect(result.id).toBe('123');
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.any(String),
                [JSON.stringify(testData.eventData), testData.dataType, testData.namespaceVersion]
            );
        });

        it('should handle database errors', async () => {
            const mockClient = {
                query: jest.fn().mockImplementationOnce( () => Promise.reject(new Error('DB Error')) )
            };
            (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

            const testData = {
                id: '',
                dataType: 'TEST',
                namespace: 'test',
                namespaceVersion: '1.0',
                eventData: '{"test": "data"}'
            };

            await expect(saveData(testData, mockClient as any)).rejects.toThrow('DB Error');
        });
    });
});
