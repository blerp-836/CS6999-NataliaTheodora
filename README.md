# HE Reference Data Pipeline

This project implements a secure and scalable data pipeline for processing and anonymizing educational event data using AWS services and the Caliper Analytics framework.

## Project Description

The HE Reference Data Pipeline is designed to ingest, process, and store educational event data in compliance with privacy regulations and data security best practices. It leverages AWS services to create a robust, serverless architecture that can handle large volumes of data while ensuring data integrity and confidentiality.

The pipeline consists of several key components:

1. Data Ingestion: Accepts Caliper event data through API endpoints.
2. Data Validation: Validates incoming data against Caliper JSON schemas.
3. Data Processing: Anonymizes personally identifiable information (PII) in the event data.
4. Data Storage: Stores raw and processed data in separate PostgreSQL databases.
5. Data Aggregation: Performs aggregations on the processed data for analytics purposes.

This pipeline is built with scalability, security, and compliance in mind, making it suitable for educational institutions and EdTech companies dealing with sensitive student data.

## Repository Structure

```
HEReferenceDataPipeline/
├── api/
│   ├── caliper/
│   ├── db-writer/
│   ├── eduapi/
│   ├── generate/
│   ├── pseudoPii/
│   └── utils/
├── backend/
│   ├── aggregate/
│   ├── customResourceFn/
│   ├── dbbootstrap/
│   └── flyway/
├── cognito/
```

### Key Files:
- `template.yaml`: The top-level AWS SAM template for the entire HE Reference Data Pipeline infrastructure.
- `samconfig.yaml`: AWS SAM deployment configuration for each instance of the pipeline across multiple environments
- `deploy.sh`: The primary deployment script for install and update of pipelines.
  - suitable for use in an automated CI/CD pipeline
- `test.sh`: A script for running all unit tests.
  - suitable for use in an automated CI/CD pipeline

### Integration Points:
- AWS Lambda functions for data processing and database operations.
- Amazon RDS for PostgreSQL databases (raw and published data).
- Amazon SQS for message queuing between processing steps.
- AWS Secrets Manager for secure credential management.

### Key Project Components:

- [Auth](./cognito/README.md): project files found in the `./cognito` directory
- [API](./api/README.md): project files found in the `./api` directory
- [Backend](./backend/README.md): project files found in the `./backend` directory

## Usage Instructions

### Installation

Prerequisites:
- Linux OS with the following installed packages:
  - AWS CLI (version 2.0 or later)
  - AWS SAM CLI (version 1.125 or later)
  - Node.js (version 14.x or later)
  - TypeScript (version 4.x or later)
  - yq (version 3.4.x or later)
  - Docker (version 24.x or later)

#### Dev env setup
1. install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html#getting-started-install-instructions)
1. install the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html#install-sam-cli-instructions)
1. install [NodeJs 20](https://nodejs.org/en/download/package-manager)
1. install Typescript globally
    * npm install -g typescript
1. install [Docker](https://docs.docker.com/engine/install/)
** Later we can create a docker container with all these tools so that the host need only to have Docker installed.

## Build and Deploy
### Steps:
1. Clone the repository:
   ```
   git clone https://github.com/1EdTech/HEReferenceDataPipeline.git
   cd HEReferenceDataPipeline
   ```
1. Configure the environment
   * See [Configuration](#configuration)
   * If an environment stack file does not already exist for the environment, create one
     - refer to [dev.aws](./dev.aws) and [qa.aws](./qa.aws) for examples
     - the file name should follow the format `<env>.aws`
     - place the file in the project root directory
   * Update or create the samconfig.yaml file, as necessary, for the environment
     - `default` (aka "dev") and `qa` configurations already exist
   * Update the `template.yaml` Mappings section with an new EnvMap entry for the new environment
1. Run the test.sh script found in the top-level directory
    * Verify you get the following lines of output
    ```
    Ran all test suites.
    All tests passed
    ```
1. Run the deploy.sh script found in the top-level directory
    * Establish AWS CLI credentials with one of the following methods:
        * use an EC2 instance role
        * set temporary credentials obtained from the AWS Identity Center SSO portal
        * create an AWS CLI profile and set the environment variable "AWS_DEFAULT_PROFILE"
        * **Note** these credentials must have Administrator level access to the target AWS account
    * run the deploy script
        * **be sure to substitute the appropriate env name for `<env>` in the following command**
      ```bash
      ./deploy.sh -s <env>
      ```
        * the script will instruct you to install additional dependencies, if you don't already have them
        * this will create or update the specified environment's pipeline
        * *Note* You may also pass the -v option in order to debug the script's execution
        * *Note* If you created a new enviornment configuration set, and the stacks fail to create on the first attempt, you may need to manually remove the failed stack in the AWS CloudFormation console
1. When deployment is complete, the outputs section of the script output will contain the API Gateway URL
    * You can also obtain this information via the AWS CloudFormation console
1. You will need to obtain the Cognito client ids and secrets
    * login to the AWS account
    * open the Cognito console
    * select the user pool from the list
    * select App clients from the left nav bar
    * select the client name
    * copy the client id and secret

### Configuration

Key environment configuration in samconfig.yaml:
- `stack_name`: The name given to the HE Reference Data Pipeline stack as seen in the CloudFormation console
- `s3_prefix`: The S3 bucket AWS SAM uses for staging artifacts for install
- `tags`: The list of tags and values to assign to created resources
- `parameter_overrides`: Env-specific parameter overrides passed onto the SAM templates
    - pEnv: a short string representing the environment name (e.g. "dev", "qa", and "prod")
        - **Note** You cannot install 2 identitically named environments in a single AWS account
    - pEncryptionKey: the 16-char encryption key used for pseudo-anonymization

Key environment configuration in the environment stack file (e.g. dev.aws):
- `SSO_ACCOUNT_NAME`: This should always be set to 'na'
- `AWS_REGION`: The AWS region where stacks will be installed
- `SAM_CONFIG_ENV`: The name given to the configuration block in samconfig.yaml for the target environment
- `DOCKER_IMAGES`: The docker image name
    - for the flyway image, the name should follow the format `<env>-aloe-flyway`

Key environment configuration in the template.yaml file 
- The mappings section contains key parameters for a given environment
- If you wish to create a new environment start with a copy of the `dev` mapping 
- `pVpcName`: The name that the `backend` template will assign the created VPC
- `pOrg`: A short string representing the developer group/team name
- `pNumAzs`: The number of availability zones to create in the VPC
- `pCreateNatGateway`: Creates a NAT gateway for the VPC.  Until AWS API endpoints fully supports IPv6, this needs to be true.
- `pCreateSingleNatGateway`: In non-prod environments, save a little money by setting this to true.
- `pCidr`: The CIDR address of the VPC.  Consider your other VPCs and your organizations other network addresses when setting this value.
- `pTier1Subnet1Cidr`: The CIDR block for the public subnet in the first availability zone.
- `pTier1Subnet2Cidr`: The CIDR block for the public subnet in the second availability zone.
- `pTier2Subnet1Cidr`: The CIDR block for the private subnet in the first availability zone.
- `pTier2Subnet2Cidr`: The CIDR block for the private subnet in the second availability zone.
- `pCreateAlarms`: Set to 'True' if you want alarms created and an SNS topic notified
- `pNotificationList`: A comma-separated list of email addresses for the SNS alarm topic

#### Create from Snapshot

The databases in an environment stack can be created from corresponding snapshots of the sensitive and published databases in another environment. To create a new environment using database snapshots:
    * obtain the sensitive and published snapshot names
    * edit `samconfig.yaml`
    * edit the `parameter_overrides` for the target environment
      * add `pPublishedDbSnapshotId=<name> pSensitiveDbSnapshotId=<name>` to the list of overrides
      * be sure to substitute the snapshot names for `<name>`
    * follow the steps in [Build and Deploy](#build-and-deploy)

#### Override the DB size

* edit `samconfig.yaml`
* edit the `parameter_overrides` for the target environment
  * add `pPublishedDbInstanceClass=<size> pSensitiveDbInstanceClass=<size>` to the list of overrides
  * be sure to substitute the appropriate size for `<size>`
  * find the list of allowed instance classes in the `DBInstanceClass` parameter in the [DB template](./backend/aurora-postgres.yaml)
* follow the steps in [Build and Deploy](#build-and-deploy)

### Testing & Quality

#### Unit testing, linting, and CI/CD integration

Integrate the following scripts can be integrated into an automated CI/CD pipeline.

The script test.sh runs unit tests for each API and Backend function. In addition to console messaging output, an exit code of 0 indicates all tests passed.
Run unit tests:
```bash
./test.sh
```

The script lint.sh runs linting checks for each API and Backend function. In addition to console messaging output, an exit code of 0 indicates all linting checks passed.
Run linting:
```bash
./lint.sh
```

#### Postman

Postman is an API developer tool used by millions of developers to build and test APIs. We have a workspace created with a set of pre-configured API requests suitable for basic testing of a deployed pipeline's API. You will need to [signup](https://identity.getpostman.com/signup) for a Postman account.  Then, please contact project owners in order to receive an invite to the team workspace.

### Stack Update Failures

When running `deploy.sh` update status will print to your terminal window.  If failures occur, and the terminal supports colors, errors will print in red.  You may need to expand the width of your terminal to see them print nicely.  

If you require more information about a failure, you can view greater detail in the AWS console.
1. login to the AWS account
2. open the AWS CloudFormation console
3. select the stack, as named in `samconfig.yaml` for the environment (e.g., reference-data-pipeline-qa)
4. view the Events tab
5. review the failures shown in red
6. a failure may have occurred in a nested stack (Auth, API, Backend, etc.)
  * select the nested stack, and repeat steps 4 & 5
7. resolve the issue indicated by the CloudFormation error message, and retry the stack update

**Note** Consider deleting stacks only as a last resort (in order to start fresh); this likely to cause you more headaches than you really want.

## Data Flow

1. Caliper events are received through the API Gateway
2. Events are validated against Caliper JSON schemas
3. Valid events are sent to an SQS queue
4. A Lambda function processes events from the queue:
   - Writes raw events to the sensitive database
   - Anonymizes PII in the events
   - Writes anonymized events to the published database
5. Aggregation functions process the anonymized data for analytics

```
[API Gateway] -> [Validator Lambda] -> [SQS Queue] -> [Processor Lambda] -> [RDS PostgreSQL]
                                                   -> [Anonymizer]       -> [RDS PostgreSQL]
                                                                         -> [Aggregator Lambda]
```

## Infrastructure

The infrastructure is defined using AWS SAM templates (AWS CloudFormation). Key resources include:

- Lambda:
  - API:
    - `CaliperFunction`: Validates incoming Caliper events
    - `EduApiFunction`: Validates incoming EduApi events
    - `InjestDbWriterFunction`: Persists new events to the Sensitive DB
    - `AnonymizeSQSFunction`: Anonymizes PII in event data and persists to the Published DB
  - Backend:
    - `DBBootStrapLambdaInvokerFn`: Invokes the DBBootStrapLambdaFn Lambda function during CloudFormation stack create
    - `DBBootStrapLambdaFn`: Initializes and configures the PostgreSQL databases
    - `FlywayLambdaFn`: Runs Flyway during stack create and stack update operations
    - `AggregateFunction`: Performs data aggregations for analytics

- RDS:
  - Backend:
    - Two PostgreSQL instances for sensitive and published data

- SQS:
  - Queues for managing event processing flow
    - `SQSInjestQueue`
    - `AnonymizeSQSQueue`

- Secrets Manager:
  - Stores database credentials and encryption keys

- IAM:
  - Roles and policies for Lambda functions and database access

- API Gateway:
  - A REST interface providing access to the injest functions
    - `CaliperFunction`
    - `EduApiFunction`

- Cognito:
  - Secures the API Gateway interface with machine-to-machine authentication

## Cost Management

By a large margin, the most expensive resources in this infrastructure are the two RDS instances.  By default each RDS instance size will be db.t4g.medium, which provides a reasonable balance between cost and performance for small installations. Monitor your database performance (see [Monitoring](./backend/README.md#performance-optimization)), and increase the instance size as necessary (see [])

## Tear Down/Cleanup

* See [Backend Cleanup](./backend/README.md#removalcleanup)