# Flyway Docker Image

This Docker image extends the official Flyway image (v7.12) with additional AWS Lambda capabilities and utilities.

## Features

- Based on Flyway 7.12
- Includes AWS Lambda Runtime Interface Emulator (RIE)
- Additional utilities installed:
  - jq
  - AWS CLI
  - curl
  - vim

## Prerequisites

- Docker installed on your system
- AWS credentials configured (if using AWS features)

## Usage

### Building the Image

To build the Docker image:

```bash
docker build -t flyway-aws .
```

### Running Migrations

Flyway runs automatically during deployments. You should not need to run it manually. There are more details [backend](../README.md) documentation.

## Configuration

### File Structure

* /flyway-files - Contains migration scripts and configuration
* /entry.sh - Entry point script that handles migration execution

### Permissions

The image runs as the flyway user for security best practices. All necessary permissions are pre-configured for the Flyway directory and executables.

### Environment Variables

Configure the following environment variables as needed:

* Environment variables
  * MASTER_SECRET_ARN - The AWS Secrets Manager Secret (containing username and password)
  * FLYWAY_URL - The JDBC URL of the db
  * FLYWAY_LOCATIONS - The directory within the image containing migration scripts
  * FLYWAY_PLACEHOLDERS_DATABASE_SCHEMA:  public
  * FLYWAY_PLACEHOLDERS_DATABASE_NAME - The database name
  * FLYWAY_PLACEHOLDERS_ENDPOINT - The DNS name of the database
  * FLYWAY_PLACEHOLDERS_PORT - The database port
  * FLYWAY_PLACEHOLDERS_REP_USER - The database username
  * USE_AWS_REGION - The AWS Region
* AWS credentials (if using AWS services)
* Any other Flyway-specific configuration
* Optionally configure values in [flyway.conf](./flyway-files/flyway/conf/flyway.conf)

## Security

* Runs as non-root user (flyway)
* Includes AWS Lambda RIE for secure Lambda execution
* Proper file permissions are set during image build

## Notes

* This image is specifically designed to work with AWS Lambda
* Includes necessary tools for AWS integration and debugging
* This image is based on a blog post [AUTOMATE DATABASE MIGRATIONS WITH FLYWAY, AWS LAMBDA AND ECR](https://autoverse.tech/cases/automate-db-migration-flyway.html)