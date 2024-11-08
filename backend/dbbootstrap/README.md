# Database Bootstrap Lambda Function

A Lambda function that automates PostgreSQL database initialization and setup for new environments.

## Overview

This Lambda function handles the initial setup and configuration of a PostgreSQL database, executing predefined SQL statements during environment creation.

## Features

- **Secure Credential Management**: Utilizes AWS Secrets Manager
- **SSL-Enabled Database Connection**: Implements secure PostgreSQL connectivity
- **Automated SQL Execution**: Runs predefined database setup statements
- **Error Handling**: Comprehensive error management and logging
- **Connection Management**: Ensures proper cleanup of database connections

## Flow Diagram

Start
↓
Get database credentials from AWS Secrets Manager
↓
Connect to PostgreSQL database
↓
If this is a "Create" event:
→ Run SQL statements
Otherwise:
→ Return "unsupported operation"
↓
Clean up connection
End

## Technical Details

### Environment Variables Required

- `MasterUserSecretArn`: ARN for the master user secret in AWS Secrets Manager
- `DBHost`: Database host address
- `DBPort`: Database port
- `DBName`: Target database name
- `REGION_NAME`: AWS region name

### Security Features

- AWS Secrets Manager integration for credential management
- SSL-enabled database connections
- Secure certificate handling

### Error Handling

The function implements comprehensive error handling:
- Connection error management
- SQL execution error handling
- Proper connection cleanup
- Detailed error logging

## Behavior

- **On Create Event**: Executes all predefined SQL statements
- **On Other Events**: Returns an "unsupported operation" message
- **Always**: Ensures proper connection cleanup

## Dependencies

- AWS SDK
- `pg` (node-postgres)
- AWS Secrets Manager
- File System access for SSL certificate

## Notes

This function is designed to run only during the initial environment setup process. It's specifically focused on the "Create" event and will reject other operation types. However, with further development it could run on update if the statements in the SQL file are idempotent.
