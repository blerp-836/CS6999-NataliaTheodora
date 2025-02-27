import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals'
import { handler, identifyPII, pseudonymizeData, findAndReplacePii } from '../pseudoPii';
import { SQSEvent, Context } from 'aws-lambda';
import { createDbConnection } from '../utils';


jest.mock('../utils.ts', () => ({
    ensureEnvVar: jest.fn((name: string) => `mock_${name}`),
    createDbConnection: jest.fn( () => ({
        query: jest.fn().mockReturnValue({
            rows: [{ id: '123', created_at: new Date() }]
        }),
        end: jest.fn()
    }))
}));

// Create test data
const testEvent = {
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "123-456-7890",
    ssn: "123-45-6789",
    creditCard: "4111-1111-1111-1111",
    nested: {
        email: "jane.doe@example.com",
        phone: "(555) 123-4567"
    },
    arrayField: [
        { email: "array@example.com" },
        { phone: "987-654-3210" }
    ]
};

const testCaliperEvent = {
    id: "urn:uuid:7e10e4f3-a0d8-4430-95bd-783ffae4d916",
    type: "ToolUseEvent",
    actor: {
        id: "urn:uuid:e0ece744d654cd0ced69564cac245df7c916fd09a00b5deb01aecbafcd2efc0c",
        type: "Person"
    },
    edApp: "https://example.edu",
    group: {
        id: "https://example.edu/terms/201601/courses/7/sections/1",
        type: "CourseSection",
        courseNumber: "CPS 435-01",
        academicSession: "Fall 2016"
    },
    action: "Used",
    object: {
        id: "https://example.edu",
        type: "SoftwareApplication"
    },
    profile: "ToolUseProfile",
    session: {
        id: "https://example.edu/sessions/1f6442a482de72ea6ad134943812bff564a76259",
        type: "Session",
        startedAtTime: "2016-11-15T10:00:00.000Z"
    },
    context: "http://purl.imsglobal.org/ctx/caliper/v1p2",
    eventTime: "2016-11-15T10:15:00.000Z",
    extensions: {
        originalActor: {
            id: "https://example.edu/users/554433",
            name: "Test User",
            type: "Person",
            email: "b202c411@pseudo.com"
        },
        randomExtension: {
            maybe_email: "john.doe@example.com"
        }
    },
    membership: {
        id: "https://example.edu/terms/201601/courses/7/sections/1/rosters/1",
        type: "Membership",
        roles: [
        "Learner"
        ],
        member: "https://example.edu/users/554433",
        status: "Active",
        dateCreated: "2016-08-01T06:00:00.000Z",
        organization: "https://example.edu/terms/201601/courses/7/sections/1"
    }
};

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

describe('PII Processing Functions', () => {
    // Setup environment variables
    beforeEach(() => {
      jest.clearAllMocks();
      process.env.underTest = 'true';
      process.env.AwsRegion = 'us-east-1';
      process.env.EncryptionKey = 'test-key';
      process.env.DBHost = 'localhost';
      process.env.DBPort = '5432';
      process.env.DBName = 'testdb';
      process.env.DBIamUser = 'testuser';
    });

    // Clean up after tests
    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('identifyPII', () => {
        it('should identify email addresses', () => {
            const text = "Contact us at test@example.com or support@company.com";
            const result = identifyPII(text);
            expect(result.EMAIL).toEqual(['test@example.com', 'support@company.com']);
        });

        it('should identify phone numbers in different formats', () => {
            const text = "Call us at 123-456-7890 or (555) 123-4567";
            const result = identifyPII(text);
            expect(result.PHONE).toEqual(['123-456-7890', '(555) 123-4567']);
        });

        it('should identify SSN', () => {
            const text = "SSN: 123-45-6789";
            const result = identifyPII(text);
            expect(result.SSN).toEqual(['123-45-6789']);
        });

        it('should identify credit card numbers', () => {
            const text = "Card: 4111-1111-1111-1111";
            const result = identifyPII(text);
            expect(result.CREDIT_DEBIT_NUMBER).toEqual(['4111-1111-1111-1111']);
        });

        it('should return null for non-matching patterns', () => {
            const text = "Regular text without PII";
            const result = identifyPII(text);
            expect(result.EMAIL).toBeNull();
            expect(result.PHONE).toBeNull();
            expect(result.SSN).toBeNull();
            expect(result.CREDIT_DEBIT_NUMBER).toBeNull();
        });
    });

    describe('pseudonymizeData', () => {
        it('should pseudonymize email addresses', () => {
            const text = "test@example.com";
            const entity = {
                Type: 'EMAIL',
                BeginOffset: 0,
                EndOffset: text.length
            };
            const result = pseudonymizeData(text, entity);
            expect(result).toMatch(/^[a-f0-9]{8}@pseudo\.com$/);
        });

        it('should pseudonymize phone numbers', () => {
            const text = "123-456-7890";
            const entity = {
                Type: 'PHONE',
                BeginOffset: 0,
                EndOffset: text.length
            };
            const result = pseudonymizeData(text, entity);
            expect(result).toMatch('<RETACTED_PHONE>');
        });

        it('should pseudonymize SSN', () => {
            const text = "123-45-6789";
            const entity = {
                Type: 'SSN',
                BeginOffset: 0,
                EndOffset: text.length
            };
            const result = pseudonymizeData(text, entity);
            expect(result).toMatch(/^[a-f0-9]{3}-[a-f0-9]{2}-[a-f0-9]{4}$/);
        });

        it('should pseudonymize credit card numbers', () => {
            const text = "4111-1111-1111-1111";
            const entity = {
                Type: 'CREDIT_DEBIT_NUMBER',
                BeginOffset: 0,
                EndOffset: text.length
            };
            const result = pseudonymizeData(text, entity);
            expect(result).toMatch(/^\*\*\*\*-\*\*\*\*-\*\*\*\*-[a-f0-9]{4}$/);
        });
    });

    describe('findAndReplacePii', () => {
        it('should replace PII in nested objects', () => {
            const testObj = { ...testEvent };
            findAndReplacePii(testObj);

            // Check that email was replaced
            expect(testObj.email).not.toBe("john.doe@example.com");
            expect(testObj.email).toMatch(/@pseudo\.com$/);

            // Check that nested email was replaced
            expect(testObj.nested.email).not.toBe("jane.doe@example.com");
            expect(testObj.nested.email).toMatch(/@pseudo\.com$/);

            // Check that array items were processed
            expect(testObj.arrayField[0].email).not.toBe("array@example.com");
            expect(testObj.arrayField[0].email).toMatch(/@pseudo\.com$/);
        });

        it('should handle empty objects', () => {
            const emptyObj = {};
            expect(() => findAndReplacePii(emptyObj)).not.toThrow();
        });

        it('should handle null values', () => {
            const objWithNull = { field: null };
            expect(() => findAndReplacePii(objWithNull)).not.toThrow();
        });
    });

    describe('Custom Caliper Logic', () => {
        it('should remove the originalActor', () => {
            findAndReplacePii(testCaliperEvent);
            expect(testCaliperEvent.extensions.originalActor).toBeUndefined();
        });
        
        it('should not re-pseudo the actor id', () => {
            findAndReplacePii(testCaliperEvent);
            expect(testCaliperEvent.actor.id).toBe("urn:uuid:e0ece744d654cd0ced69564cac245df7c916fd09a00b5deb01aecbafcd2efc0c");
        });
        
        it('Should detect emails in unexpected places', () => {
            findAndReplacePii(testCaliperEvent);
            expect(testCaliperEvent.extensions.randomExtension.maybe_email).not.toBe("jane.doe@example.com");
            expect(testCaliperEvent.extensions.randomExtension.maybe_email).toMatch(/@pseudo\.com$/);
        });
    });

    describe('Lambda Handler', () => {
        it('should process SQS events successfully', async () => {
            // Create test event
            const sqsEvent: SQSEvent = {
                Records: [{
                    messageId: '123',
                    body: JSON.stringify(testEvent),
                    attributes: {} as any,
                    messageAttributes: {},
                    md5OfBody: '',
                    eventSource: '',
                    eventSourceARN: '',
                    awsRegion: '',
                    receiptHandle: ''
                }]
            };

            // Mock successful DB connection
            const mockClient = {
                query: jest.fn().mockReturnValue({
                    rows: [{ id: '123', created_at: new Date() }]
                }),
                end: jest.fn()
            };
            (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

            const response = await handler(sqsEvent, context, jest.fn());
            expect(response?.batchItemFailures).toHaveLength(0);
        });

        it('should handle errors gracefully', async () => {
            const mockClient = {
                query: jest.fn().mockImplementationOnce( () => Promise.reject(new Error('DB Error')) )
            };
            (createDbConnection as jest.Mock).mockImplementation(() => mockClient);

            // Create test event
            const sqsEvent: SQSEvent = {
                Records: [{
                    messageId: '123',
                    body: JSON.stringify('invalid JSON'),
                    attributes: {} as any,
                    messageAttributes: {},
                    md5OfBody: '',
                    eventSource: '',
                    eventSourceARN: '',
                    awsRegion: '',
                    receiptHandle: ''
                }]
            };

            const response = await handler(sqsEvent, context, jest.fn());
            expect(response?.batchItemFailures).toHaveLength(1);
            expect(response?.batchItemFailures[0].itemIdentifier).toBe('123');
        });
    });
});
