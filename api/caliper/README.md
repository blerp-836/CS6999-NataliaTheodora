# Caliper Event Validation and Processing Lambda Function

This project implements a Lambda function for validating and processing Caliper events in the HEReferenceDataPipeline. It ensures incoming Caliper events conform to the specified schemas and forwards valid events to an SQS queue for further processing.

The Lambda function serves as a crucial component in the data pipeline, acting as a gatekeeper for Caliper events. It validates the structure and content of incoming events against Caliper v1.1 and v1.2 schemas, ensuring data integrity before passing the events to downstream processes.

Key features include:
- Validation of Caliper events against v1.1 and v1.2 schemas
- Support for batch event processing
- Integration with AWS SQS for event queueing
- Comprehensive error handling and reporting

## Usage Instructions

### Installation

Prerequisites:
- Node.js (v14 or later)
- npm (v6 or later)
- AWS CLI configured with appropriate permissions

To install the project dependencies:

```bash
cd HEReferenceDataPipeline/api/caliper
npm install
```

### Configuration

Set the following environment variables:

- `AwsRegion`: AWS region for SQS
- `SQSInjestQueueUrl`: URL of the SQS queue for event ingestion

### Running Tests

To run the test suite:

```bash
npm test
```

### Local Development

To run the validation script locally:

```bash
npx tsx validate.ts
```

This will validate the example Caliper events in the `examples` directory against the schemas.

### Deployment

The Lambda function is typically deployed as part of the larger HEReferenceDataPipeline infrastructure. Refer to the main project documentation for deployment instructions.

## Data Flow

The Caliper event processing flow is as follows:

1. API Gateway receives a Caliper event payload
2. The Lambda function is triggered with the event data
3. The function validates the Caliper envelope structure
4. If valid, it then validates each individual event in the payload
5. Valid events are sent to the SQS queue for further processing
6. The function returns a success or error response to the API Gateway

```
[API Gateway] -> [Lambda Function] -> [Validation] -> [SQS Queue]
                         |
                         v
                  [Response to API]
```

Important technical considerations:
- The function handles both v1.1 and v1.2 Caliper schemas
- Batch event processing is supported
- Invalid events are rejected, and detailed error messages are returned

## Troubleshooting

Common issues and solutions:

1. Schema Validation Errors
   - Problem: Events fail schema validation
   - Error message: "Invalid JSON" with specific validation errors
   - Diagnostic process:
     1. Check the Caliper version specified in the event
     2. Verify the event structure against the Caliper specification
   - Solution: Correct the event data to match the Caliper schema

2. SQS Connection Issues
   - Problem: Events can't be sent to SQS
   - Error message: "Error sending message to SQS"
   - Diagnostic process:
     1. Verify AWS credentials and permissions
     2. Check SQS queue URL and region settings
   - Solution: Ensure correct AWS configuration and SQS setup

To enable debug mode, set the `DEBUG` environment variable to `true`. This will output additional logging information to CloudWatch Logs.

For performance optimization:
- Monitor the Lambda function's execution time and memory usage
- Consider adjusting the function's memory allocation if processing large batches of events
- Use AWS X-Ray for tracing and identifying bottlenecks in the event processing pipeline