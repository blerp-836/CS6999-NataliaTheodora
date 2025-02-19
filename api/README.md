# Caliper Event Processing Pipeline

This project implements a data pipeline for processing and validating Caliper learning analytics events and EduAPI events.

The HEReferenceDataPipeline is designed to ingest, validate, and process Caliper and EduAPI events from educational technology systems. It provides a robust framework for handling learning analytics data in compliance with the IMS Global Caliper and EduAPI Analytics specifications.

## Repository Structure

```
HEReferenceDataPipeline/
└── api/
    ├── caliper/
    │   ├── caliper.ts
    │   ├── CaliperValidator.ts
    │   ├── examples/
    │   ├── tests/
    │   │   └── caliper.test.ts
    │   └── validate.ts
    ├── db-writer/
    │   ├── db-writer.ts
    │   └── tests/
    │       └── db-writer.test.ts
    ├── eduapi/
    │   ├── eduapi.ts
    │   └── tests/
    │       └── eduapi.test.ts
    └── json-schema/
        ├── caliper/
        │   ├── v1_1/
        │   └── v1_2/
        └── eduapi/
            └── v1p0/
```

Key Files:
- `api/caliper/caliper.ts`: Main entry point for Caliper event processing
- `api/caliper/CaliperValidator.ts`: Validator for Caliper events
- `api/db-writer/db-writer.ts`: Database writer for processed events
- `api/eduapi/eduapi.ts`: API for educational data integration

## Data Flow

1. Caliper events are received by the API Gateway
2. Events are passed to the `lambdaHandler` in `caliper.ts`
3. The `CaliperValidator` validates the events against the appropriate schema
4. Valid events are sent to an SQS queue for further processing
5. The `db-writer` consumes events from the queue and writes them to the database

```
[API Gateway] -> [Lambda (caliper.ts)] -> [CaliperValidator] -> [SQS Queue] -> [db-writer] -> [Database]
```

## Infrastructure

The application uses the following AWS resources:

- Lambda:
  - [CaliperFunction](./caliper/README.md): Processes incoming Caliper events and places them on the SQSInjestQueue
  - [EduApiFunction](./eduapi/README.md): Processes incoming EduAPI events and places them on the SQSInjestQueue
  - [InjestDbWriterFunction](./db-writer/README.md): Processes events on the SQSInjestQueue and writes them to the database. Once saved, the function then places them on the AnonymizeSQSQueue.
  - [AnonymizeSQSFunction](./pseudoPii/README.md): Processes events on the AnonymizeSQSQueue, replacing sensitive data with pseudo-anonymized (encrypted) data.

- SQS:
  - `SQSInjestQueue`: Queue for storing validated Caliper and EduAPI events
  - `AnonymizeSQSQueue`: Queue for storing persisted Caliper and EduAPI events

- API Gateway:
  - `AnalyticsApi`: REST API for receiving Caliper events

- RDS Database:
  - `SensitiveDB`: Provided by the `backend` stack.  Used for storing raw event data.
  - `PublishedDB`: Provided by the `backend` stack.  Used for storing pseudo-anonymized (encrypted) event data.

## Monitoring

To monitor the health and performance of the Lambda functions in this project:

1. Check Lambda function health:
   - Open the AWS Lambda console
   - Select the function you want to monitor (e.g., CaliperFunction, EduApiFunction)
   - View the "Monitoring" tab for metrics such as invocations, errors, and duration

2. View Lambda logs:
   - In the AWS Lambda console, select the function
   - Click on the "Monitor" tab
   - Click on "View logs in CloudWatch"
   - This will open the CloudWatch Logs console with the log group for the selected function
   - By default, the CloudWatch logs retention policy is 'Never expire'
     - modify retention, if necessary, via the CloudWatch Logs console

3. Check SQS queue status:
   - Open the AWS SQS console
   - Check the `Messages available` and `Messages in flight` columns
     - large numbers may indicate trouble
   - Select the queue for which you want to review more detailed monitoring (e.g., AnonymizeSQSQueue)
   - View the "Monitoring" tab for metrics such as Approximate Age Of Oldest Message, Number Of Empty Receives, and Number Of Messages Sent

4. Check RDS server health:
   - Open the AWS RDS console
   - Choose "Databases" in the left navigation, and select the instance you want to see (e.g., PublishedDB)
   - View the "Monitoring" tab
   - Use the "Performance Insights" tool (left navigation) to analyze database load

5. CloudWatch Alarms:
   - The SAM template file, `template.yaml`, defines several CloudWatch alarms for monitoring the Lambda functions
   - These alarms trigger when certain thresholds are exceeded (in particular, SQS queue depth)
   - Alarms send notifications to SNS topics, which can be configured to alert via email (parameter pNotificationList)

6. SNS Topics:
   - When a CloudWatch alarm is triggered, it sends a notification to the configured SNS topic
   - To view or modify SNS topics:
     - Preferred method
       - Update the SAM template and run SAM deploy
       - You can add or remove subscribers to control who receives notifications by updating the pNotificationList param
     - Manual method (this cause stack drift)
       - Open the Amazon SNS console
       - Navigate to "Topics"
       - Find the topic associated with your alarms (e.g., "dev-queue-alarms")
       - You can add or remove subscribers to control who receives notifications

## Lambda Scaling

Lambda functions in this project can scale automatically based on the incoming request rate. However, you may need to adjust some settings for optimal performance. While you can make adjustments directly in the AWS console, it is better to modify the SAM template and re-deploy. See [AWS::Serverless::Function](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-resource-function.html) for modifying the `template.yaml`.

1. Concurrency:
   - You can set reserved concurrency to guarantee a certain number of instances for critical functions
     - This setting can limit/throttle a function
     - The two injest functions, CaliperFunction and EduApiFunction, are not throttled and can scale up to the account's concurrency limit.
     - The InjestDbWriterFunction and AnonymizeSQSFunction are throttled by using the `ScalingConfig` on the event-source mapping (so as to limit the number of db connections)
   - You can utilize provisioned concurrency to keep a pool of pre-initialized lambda functions for maximum performance
   - To modify concurrency settings:
       - Configure ReservedConcurrentExecutions and/or ProvisionedConcurrencyConfig, as appropriate

2. Memory and Timeout:
   - Increase memory allocation (MemorySize parameter) for better CPU performance
   - Adjust the timeout value (Timeout parameter) based on your function's execution time

3. SQS Trigger Settings:
   - For functions triggered by SQS (e.g., InjestDbWriterFunction), you can adjust the batch size and window to control scaling behavior
   - BatchSize and MaximumBatchingWindowInSeconds are parameters on the `AWS::Lambda::EventSourceMapping` type

For more detailed information on Lambda scaling, refer to the official AWS documentation:
- [AWS Lambda Function Scaling](https://docs.aws.amazon.com/lambda/latest/dg/invocation-scaling.html)
- [Best Practices for Working with AWS Lambda Functions](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

## Database Scaling

Refer the [backend](../backend/README.md) documentation

## SQS Dead-Letter Queues

If failures occur during injest or anonymization, the functions will try to reprocess the messages.  If subsequent attempts continue to fail, messages will be moved the dead-letter queues. CloudWatch alarms will send notifications to the SNS topic when DLQ size reaches a threshold.

To re-process failed messages:
- Examine the message contents to understand failures
- Check application logs for related exceptions
- Verify if processing timeout settings are appropriate
- Use the dead-letter queue redrive feature to move messages back to the source queue for reprocessing