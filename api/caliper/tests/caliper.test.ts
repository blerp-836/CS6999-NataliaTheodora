import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals'
import { APIGatewayProxyEvent } from 'aws-lambda';
import { SQSClient } from "@aws-sdk/client-sqs";
import { lambdaHandler } from '../caliper';
import CaliperValidator from '../CaliperValidator';

// Mock the dependencies
jest.mock('@aws-sdk/client-sqs');
jest.mock('../CaliperValidator');

describe('lambdaHandler', () => {
  // Setup environment variables
  beforeEach(() => {
    process.env.AwsRegion = 'us-east-1';
    process.env.SQSInjestQueueUrl = 'https://sqs.example.com';
    process.env.underTest = 'true';
  });

  // Clean up after tests
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 when body is missing', async () => {
    const event = {
      body: null
    } as APIGatewayProxyEvent;

    const response = await lambdaHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('The message body must contain a JSON document');
  });

  it('should validate and process v1p1 caliper events', async () => {
    // Mock the validator response
    (CaliperValidator as jest.Mock).mockImplementation(() => ({
      validateEnvelopeAndEvents: jest.fn().mockReturnValue([])
    }));

    // Mock SQS client
    (SQSClient as jest.Mock).mockImplementation(() => ({
      send: jest.fn().mockReturnValueOnce({ MessageId: '123' })
    }));

    const event = {
      body: JSON.stringify({
        dataVersion: 'v1p1',
        data: [{
          type: 'TestEvent',
          // Add other required event properties
        }]
      })
    } as APIGatewayProxyEvent;

    const response = await lambdaHandler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBe('successfully validated caliper events');
  });

  it('should return 400 for invalid caliper version', async () => {
    const event = {
      body: JSON.stringify({
        dataVersion: 'invalid',
        data: []
      })
    } as APIGatewayProxyEvent;

    const response = await lambdaHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).errors).toContain('Caliper version must be v1p1 or v1p2');
  });

  it('should return 400 when validation fails', async () => {
    // Mock validation errors
    (CaliperValidator as jest.Mock).mockImplementation(() => ({
      validateEnvelopeAndEvents: jest.fn().mockReturnValue(['Error 1', 'Error 2'])
    }));

    const event = {
      body: JSON.stringify({
        dataVersion: 'v1p1',
        data: []
      })
    } as APIGatewayProxyEvent;

    const response = await lambdaHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe('Invalid JSON');
    expect(JSON.parse(response.body).validationErrors).toEqual(['Error 1', 'Error 2']);
  });

  it('should handle SQS errors appropriately', async () => {
    // Mock successful validation
    (CaliperValidator as jest.Mock).mockImplementation(() => ({
      validateEnvelopeAndEvents: jest.fn().mockReturnValue([])
    }));

    // Mock SQS error
    (SQSClient as jest.Mock).mockImplementation(() => ({
      send: jest.fn().mockImplementationOnce( () => Promise.reject(new Error('SQS Error')) )
    }));

    const event = {
      body: JSON.stringify({
        dataVersion: 'v1p1',
        data: [{
          type: 'TestEvent'
        }]
      })
    } as APIGatewayProxyEvent;

    const response = await lambdaHandler(event);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBe('some error happened');
  });
});
