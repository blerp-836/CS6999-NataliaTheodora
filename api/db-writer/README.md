# HEReferenceDataPipeline DB Writer Lambda Function

This project contains a Lambda function that processes SQS messages and saves data to a PostgreSQL database using AWS IAM authentication.

The DB Writer Lambda function is part of the HEReferenceDataPipeline, designed to handle incoming data events, store them in a sensitive database, and queue them for anonymization.

## Repository Structure

```
HEReferenceDataPipeline/
└── api/
    └── db-writer/
        ├── babel.config.js
        ├── db-writer.ts
        ├── jest.config.cjs
        ├── package.json
        ├── tests/
        │   └── db-writer.test.ts
        ├── tsconfig.json
        └── utils.ts
```

Key Files:
- `db-writer.ts`: Main Lambda function code
- `utils.ts`: Utility functions for database connections and environment variables
- `package.json`: Project dependencies and scripts
- `tsconfig.json`: TypeScript configuration

## Usage Instructions

### Installation

Prerequisites:
- Node.js (version 14.x or later)
- npm (version 6.x or later)
- AWS CLI configured with appropriate permissions

Steps:
1. Clone the repository:
   ```
   git clone https://github.com/1EdTech/HEReferenceDataPipeline.git
   ```
2. Navigate to the db-writer directory:
   ```
   cd HEReferenceDataPipeline/api/db-writer
   ```
3. Install dependencies:
   ```
   npm install
   ```

### Configuration

Set the following environment variables:
- `DBHost`: Database host
- `DBPort`: Database port
- `DBName`: Database name
- `DBIamUser`: IAM user for database authentication
- `AwsRegion`: AWS region
- `AnonymizeSQSQueueUrl`: URL of the SQS queue for anonymization

### Testing

Run unit tests:
```
npm test
```

### Deployment

Deploy the Lambda function using your preferred method (e.g., AWS SAM, Serverless Framework, or manual upload).

Ensure the Lambda function has the necessary IAM permissions to:
- Read from the source SQS queue
- Write to the target SQS queue
- Connect to the RDS database using IAM authentication

### Troubleshooting

Common issues and solutions:

1. Database Connection Failures
   - Problem: Lambda function fails to connect to the database
   - Solution: 
     - Verify the database environment variables are correctly set
     - Ensure the Lambda function's VPC settings allow it to reach the database
     - Check that the IAM role has the necessary permissions for RDS IAM authentication

2. SQS Message Processing Errors
   - Problem: Messages are not being processed or are ending up in the dead-letter queue
   - Solution:
     - Review CloudWatch logs for specific error messages
     - Verify the message format matches the expected schema in `db-writer.ts`
     - Ensure the Lambda function has permission to read from and delete messages from the SQS queue

3. Anonymization Queue Issues
   - Problem: Processed messages are not appearing in the anonymization queue
   - Solution:
     - Check that the `AnonymizeSQSQueueUrl` environment variable is correctly set
     - Verify the Lambda function has permission to send messages to the anonymization queue
     - Review CloudWatch logs for any errors related to SQS message sending

**Note** that all of the issues described above should result in alarm notifications due to SQS queue sizes growing beyond thresholds. 

For further debugging:
- Enable debug logging by setting the `LOG_LEVEL` environment variable to `DEBUG`
- Review CloudWatch logs for detailed execution information
- Use AWS X-Ray for tracing if enabled

## Data Flow

The DB Writer Lambda function processes data through the following steps:

1. Receives SQS messages containing event data
2. Parses and validates the incoming message
3. Connects to the PostgreSQL database using IAM authentication
4. Saves the raw event data to the appropriate table in the database
5. Sends the processed data to an anonymization SQS queue
6. Returns success or failure status for each processed message

```
[SQS Queue] -> [DB Writer Lambda] -> [PostgreSQL Database]
                       |
                       v
               [Anonymization Queue]
```

Notes:
- The function uses batch processing to handle multiple SQS messages in a single invocation
- Failed messages are reported back to SQS for retry or dead-letter queue processing
- Database connections are created for each Lambda invocation and closed afterwards