# HE Reference Data Pipeline Aggregation Function

This project provides an example Lambda function for aggregating Caliper event data stored in a PostgreSQL database. It is part of the Higher Education Reference Data Pipeline backend.

The aggregation function performs a simple count of different event types from the `caliper_published_events` table and stores the results in a new `caliper_event_counts` table. This demonstrates how you might aggregate events for analysis and reporting.

## Repository Structure

The repository is structured as follows:

```
HEReferenceDataPipeline/
└── backend/
    └── aggregate/
        ├── aggregate.ts
        ├── package.json
        ├── tsconfig.json
        └── utils.ts
```

Key files:
- `aggregate.ts`: Contains the main Lambda function handler and aggregation logic.
- `utils.ts`: Provides utility functions for environment variable validation and database connection.
- `package.json`: Defines project dependencies and scripts.
- `tsconfig.json`: Configures TypeScript compiler options.

## Usage Instructions

### Installation

Prerequisites:
- Node.js (version 14.x or later)
- npm (version 6.x or later)
- AWS CLI configured with appropriate permissions

To install the project dependencies, run:

```bash
npm install
```

### Configuration

The following environment variables must be set:

- `DBHost`: PostgreSQL database host
- `DBPort`: PostgreSQL database port
- `DBName`: PostgreSQL database name
- `DBIamUser`: IAM user for database authentication
- `AwsRegion`: AWS region where the database is located

Ensure these variables are set in your Lambda function configuration or local environment.

### Troubleshooting

Common issues and solutions:

1. Database connection failures:
   - Ensure all environment variables are correctly set.
   - Verify that the IAM user has the necessary permissions to access the RDS instance.
   - Check if the Lambda function's VPC settings allow it to reach the RDS instance.

2. "Error: Environment variable X is not set":
   - Double-check that all required environment variables are set in your Lambda function configuration or local environment.

3. TypeScript compilation errors:
   - Run `npm run compile` to see detailed error messages.
   - Ensure all dependencies are installed (`npm install`).
   - Check that your TypeScript version matches the one specified in `package.json`.

For debugging:
- Enable verbose logging by setting the environment variable `DEBUG=true`.
- Check CloudWatch Logs for detailed Lambda execution logs.

## Data Flow

The example aggregation process follows these steps:

1. The Lambda function is triggered (e.g., on a schedule or by an event).
2. Environment variables are validated and database connection details are retrieved.
3. A connection to the PostgreSQL database is established using IAM authentication.
4. The existing `caliper_event_counts` table is dropped (if it exists).
5. A new `caliper_event_counts` table is created by aggregating data from `caliper_published_events`.
6. The aggregation results are stored in the new table.
7. The function returns a success message.

```
[Lambda Trigger] -> [Validate Env Vars] -> [Connect to DB] -> [Drop Old Table] 
                 -> [Create New Table with Aggregated Data] -> [Return Result]
```

Note: Ensure that the Lambda function has sufficient memory and execution time limits set, as the aggregation process may be resource-intensive for large datasets.

## PostgreSQL JSONB Query Examples

This section provides examples of using PostgreSQL JSONB queries to extract and analyze data from the `eduapi_published_events` table. These queries demonstrate how to work with JSON data stored in PostgreSQL.

1. Extracting a single JSON field:

```sql
SELECT event->>'primaryEmail' FROM eduapi_published_events WHERE event_type = 'person';
```

This query selects the `primaryEmail` field from the `event` JSON column for all rows where the `event_type` is 'person'. The `->>'` operator extracts the JSON field as text.

2. Extracting a nested JSON field:

```sql
SELECT event->'primaryEmail'->>'email' FROM eduapi_published_events WHERE event_type = 'person';
```

This query extracts the `email` field nested within the `primaryEmail` object from the `event` JSON column. The `->` operator is used to navigate through the JSON structure, and `->>'` is used to extract the final value as text.

3. Counting rows based on a JSON field condition:

```sql
SELECT count(*) FROM eduapi_published_events WHERE event_type = 'person' and event->'primaryEmail'->>'email' LIKE '%pseudo.com';
```

This query counts the number of rows where the email address (nested within the `primaryEmail` object in the `event` JSON column) ends with 'pseudo.com'. It demonstrates how to use JSON operators in combination with standard SQL conditions.

These examples showcase the flexibility of PostgreSQL's JSONB data type and how it can be used to store and query complex data structures within a single column.