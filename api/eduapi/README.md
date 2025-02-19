# Education API Lambda Handler

A TypeScript-based AWS Lambda function that handles API Gateway requests for validating and storing educational data against predefined JSON schemas. Specifically, this endpoint handles EduAPI schema types.

## Overview

This Lambda function serves as an API endpoint that:
1. Validates incoming JSON data against predefined EduAPI schemas
2. Stores validated data in a PostgreSQL database using AWS IAM authentication
3. Provides detailed validation feedback for invalid requests

## Prerequisites

- AWS Lambda environment
- PostgreSQL database (AWS RDS)
- Node.js 18.x or later
- AWS IAM credentials configured
- Required environment variables set

## Environment Variables

The following environment variables must be configured:

| Variable | Description |
|----------|-------------|
| `DBHost` | PostgreSQL database host |
| `DBPort` | PostgreSQL database port |
| `DBName` | Database name |
| `DBUsername` | Database username |
| `AwsRegion` | AWS region for RDS IAM authentication |

## API Endpoints

### POST /{schema}/{version}

Validates and stores data according to the specified schema and version.

#### Path Parameters
- `schema`: Name of the JSON schema to validate against
- `version`: Version of the schema to use

#### Request Body
JSON payload that conforms to the specified schema

#### Responses

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Data validated and stored |
| 400 | Bad Request - Invalid JSON or schema validation failed |
| 500 | Server Error - Internal processing error |

#### Example Request
```bash
POST /student-record/v1
Content-Type: application/json

{
  "studentId": "12345",
  "name": "John Doe",
  "grade": "A"
}
```

#### Example Response (Success)
```bash
{
  "message": "hello eduapi"
}
```

#### Example Response (Validation Error)
```bash
{
  "message": "Invalid JSON",
  "errors": [
    "/studentId must be a string"
  ]
}
```

## Schema Files

JSON schema files should be placed in the following directory structure:
```
/opt/eduapi/{version}/{schema}.json
```

Example:
```
/opt/eduapi/v1/student-record.json
```

## Database

The application stores validated data in a PostgreSQL database using AWS IAM authentication.

### Table Structure

```sql
CREATE TABLE raw_events (
    id SERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    type_version VARCHAR(50) NOT NULL,
    create_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Security

* Uses AWS IAM authentication for database connections
* Implements parameterized queries to prevent SQL injection
* Validates all input data against predefined schemas
* SSL/TLS encryption for database connections

### Error Handling

The application implements comprehensive error handling for:
* Missing environment variables
* Invalid JSON payloads
* Schema validation failures
* Database connection issues
* General runtime errors

### Development
#### Installation
```bash
npm install
```

#### Required Dependencies
See package.json

#### Building
```bash
npm run compile
```

#### Testing
```bash
npm test
```