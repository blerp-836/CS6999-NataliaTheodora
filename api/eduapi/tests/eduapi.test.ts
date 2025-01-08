import { jest, describe, beforeEach, afterAll, it, expect } from '@jest/globals'
import { APIGatewayProxyEvent } from 'aws-lambda';
import { lambdaHandler, ensureEnvVar, validateJsonWithSchema, sendMessageToSQS } from '../eduapi';
import { SQSClient } from '@aws-sdk/client-sqs';
import fs from 'fs/promises';

// Mock AWS SDK
jest.mock('@aws-sdk/client-sqs');
jest.mock('fs/promises');

process.env.AwsRegion = 'us-east-1';
process.env.SQSInjestQueueUrl = 'https://sqs.example.com';
process.env.underTest = 'true';

describe('eduapi', () => {
  // Test environment variable helper
  describe('ensureEnvVar', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
      process.env.AwsRegion = 'us-east-1';
      process.env.SQSInjestQueueUrl = 'https://sqs.example.com';
      process.env.underTest = 'true';
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return environment variable when it exists', () => {
      process.env.TEST_VAR = 'test-value';
      const result = ensureEnvVar('TEST_VAR');
      expect(result).toBe('test-value');
    });

    it('should throw error when environment variable is not set', () => {
      expect(() => ensureEnvVar('NONEXISTENT_VAR')).toThrow();
    });
  });

  // Test lambda handler
  describe('lambdaHandler', () => {
    let mockEvent: Partial<APIGatewayProxyEvent>;

    beforeEach(() => {
      mockEvent = {
        body: JSON.stringify({ test: 'data' }),
        pathParameters: {
          schema: 'testSchema',
          version: 'v1'
        }
      };
      
      // Mock fs.access to simulate schema file exists
      (fs.access as jest.Mock).mockReturnValue(undefined);
      
      // Mock fs.readFile to return a simple schema
      (fs.readFile as jest.Mock).mockReturnValue(JSON.stringify({
        type: 'object',
        properties: {
          test: { type: 'string' }
        }
      }));
    });

    it('should return 400 when body is missing', async () => {
      mockEvent.body = null;
      const response = await lambdaHandler(mockEvent as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('body must contain');
    });

    it('should return 400 when path parameters are missing', async () => {
      mockEvent.pathParameters = null;
      const response = await lambdaHandler(mockEvent as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('missing path parameters');
    });

    it('should return 400 when schema file does not exist', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('File not found') as never);

      const response = await lambdaHandler(mockEvent as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('schema/version not found');
    });

    it('should return 200 for valid request with valid schema', async () => {
      // Mock SQS send
      (SQSClient.prototype.send as jest.Mock).mockReturnValue({ MessageId: 'test-message-id' });
      
      const response = await lambdaHandler(mockEvent as APIGatewayProxyEvent);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).message).toContain('successfully validated');
    });
  });

  // Test validateJsonWithSchema
  describe('validateJsonWithSchema', () => {
    beforeEach(() => {
      (fs.readFile as jest.Mock).mockReturnValue(JSON.stringify({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        },
        required: ['name', 'age']
      }));
    });

    it('should validate valid JSON against schema', async () => {
      const validJson = {
        name: 'John',
        age: 30
      };
      
      const result = await validateJsonWithSchema(validJson, 'dummy-path');
      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    it('should return errors for invalid JSON', async () => {
      const invalidJson = {
        name: 123,  // should be string
        age: 'thirty' // should be number
      };
      
      const result = await validateJsonWithSchema(invalidJson, 'dummy-path');
      expect(result.valid).toBe(false);
      expect(result.errors).toBeTruthy();
    });
  });

  // Test sendMessageToSQS
  describe('sendMessageToSQS', () => {
    it('should successfully send message to SQS', async () => {
      const mockMessageId = 'test-message-id';
      (SQSClient.prototype.send as jest.Mock).mockResolvedValue({ MessageId: mockMessageId } as never);

      const testData = {
        dataType: 'test',
        namespace: 'eduapi',
        namespaceVersion: 'v1',
        eventData: 'test-data'
      };

      const result = await sendMessageToSQS(testData);
      expect(result).toBe(mockMessageId);
    });

    it('should throw error when SQS send fails', async () => {
      (SQSClient.prototype.send as jest.Mock).mockRejectedValue(new Error('SQS error') as never);

      const testData = {
        dataType: 'test',
        namespace: 'eduapi',
        namespaceVersion: 'v1',
        eventData: 'test-data'
      };

      await expect(sendMessageToSQS(testData)).rejects.toThrow('SQS error');
    });
  });
});
