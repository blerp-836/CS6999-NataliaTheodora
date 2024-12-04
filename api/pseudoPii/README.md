# PseudoPII Data Anonymization Service

A serverless service that automatically detects and anonymizes Personally Identifiable Information (PII) in event data using AWS Lambda and SQS.

## Overview

PseudoPII processes incoming events containing sensitive data and replaces PII with pseudonymized values while maintaining data format consistency. The service currently detects and anonymizes:

- Email addresses
- Phone numbers
- Social Security Numbers (SSN)
- Credit/Debit card numbers

## Features

- Parallel processing of SQS message batches
- HMAC-based pseudonymization for consistent data mapping
- Recursive object traversal for deep PII detection
- Format-preserving anonymization
- Error handling with partial batch failures
- Structured logging

## Architecture

The service operates as an AWS Lambda function triggered by SQS events:

1. Receives batch of messages from SQS
2. Processes messages in parallel
3. Detects PII using regex patterns
4. Anonymizes detected PII
5. Stores processed data in PostgreSQL
6. Returns batch item failures for retry handling

## Installation

1. Set required environment variables:
```bash
DB_HOST=<database-host>
DB_PORT=<database-port>
DB_NAME=<database-name>
DB_IAM_USER=<database-iam-user>
AWS_REGION=<aws-region>
ENCRYPTION_KEY=<encryption-key>
```
2. Deploy the Lambda function with appropriate IAM roles and permissions

## Usage
The service processes events in the following format:

```typescript
interface RawData {
  id: string;
  dataType: string;
  namespaceVersion: string;
  eventData: string;
}
```

### Example Input
```json
{
  "id": "123",
  "dataType": "USER_EVENT",
  "namespaceVersion": "1.0",
  "eventData": {
    "email": "user@example.com",
    "phone": "123-456-7890"
  }
}
```

## Error Handling
The service implements a partial batch failure mechanism:
- Individual message failures are tracked
- Failed messages are returned to SQS for retry
- Critical errors are logged for monitoring

## Development
- Prerequisites
- Node.js 18+
- TypeScript 4.x
- AWS SDK v3
- PostgreSQL client

## Testing
```bash
npm install
npm test
```

## Security Considerations
- Uses HMAC-SHA256 for pseudonymization
- Encryption key stored in environment variables
- IAM authentication for database access
- No plaintext PII logging
- Secure HTTPS database connections

## Limitations
- Regex-based PII detection may have false positives/negatives
- Currently supports English format patterns only
- Maximum event size limited by Lambda payload limits
- Processing time affected by event complexity

