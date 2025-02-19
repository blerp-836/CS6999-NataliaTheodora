# HEReferenceDataPipeline: A Scalable Data Processing System for Educational Events

HEReferenceDataPipeline is a robust, serverless data processing system designed to handle and analyze educational event data at scale. It leverages AWS services to provide a secure, efficient, and highly available pipeline for processing sensitive and published educational data.

The system is built on a multi-tier VPC architecture, utilizing Aurora PostgreSQL for data storage, AWS Lambda for serverless compute, and various other AWS services for security, monitoring, and data flow management. It's designed to handle both sensitive and published data, with separate pipelines and databases for each, ensuring data privacy and compliance with educational data standards.

## Repository Structure

```
HEReferenceDataPipeline/
└── backend/
    ├── aggregate/
    │   ├── aggregate.ts
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── utils.ts
    ├── aurora-postgres.yaml
    ├── customResourceFn/
    │   ├── customInvoker.ts
    │   └── package.json
    ├── dbbootstrap/
    │   ├── dbbootstrap.ts
    │   ├── package.json
    │   ├── sqlStatements.ts
    │   └── tsconfig.json
    ├── flyway/
    │   ├── Dockerfile
    │   └── flyway-files/
    │       ├── entry.sh
    │       └── flyway/
    │           ├── lambda-entrypoint.sh
    │           └── sql/
    │               ├── published/
    │               │   ├── V1.0__published_events.sql
    │               │   └── V1.1__split_events.sql
    │               └── sensitive/
    │                   ├── V1.0__raw_events.sql
    │                   └── V1.1__split_events.sql
    └── template.yaml
```

### Key Files:

- `backend/template.yaml`: Main CloudFormation template for the VPC and infrastructure setup.
- `backend/aurora-postgres.yaml`: CloudFormation template for Aurora PostgreSQL cluster setup.
- `backend/aggregate/aggregate.ts`: Lambda function for data aggregation.
- `backend/customResourceFn/customInvoker.ts`: Custom resource Lambda function for CloudFormation.
- `backend/dbbootstrap/dbbootstrap.ts`: Lambda function for database bootstrapping.
- `backend/flyway/Dockerfile`: Dockerfile for Flyway database migration container.
- `backend/ssl/rds-combined-ca-bundle.pem`: The CA cert for the RDS databases (Lambda functions connect with SSL)

### Important Integration Points:

- Aurora PostgreSQL Cluster: Main data storage for both sensitive and published data.
- Lambda Functions: Serverless compute for bootstrapping during initial setup and aggregation.
- VPC: Secure network environment for the entire system.
- IAM Roles and Permissions: Manage access control across the system.

## Usage Instructions

### Installation

See [Installation](../README.md#installation)

### Configuration

See [Configuration](../README.md#configuration)

### Deployment

See [Deployment](../README.md#build-and-deploy)

### Troubleshooting

1. VPC Connectivity Issues:
   - Check Security Group settings in the CloudFormation template.
   - Verify NAT Gateway and Internet Gateway configurations.

2. Database Access Problems:
   - Ensure IAM roles have correct permissions.
   - Check the `rds_iam` role assignments in the bootstrap SQL statements.

3. Lambda Function Errors:
   - Review CloudWatch Logs for detailed error messages.
   - Verify environment variables are correctly set.

### Performance Optimization

- Monitor RDS Performance Insights for database query performance.
- Use AWS X-Ray to trace requests through the system and identify bottlenecks.
- Adjust Aurora PostgreSQL instance sizes based on workload.

### Creating an EC2 Instance for Database Access

To create an EC2 instance within the VPC that can access both the sensitive and published databases using the PostgreSQL client, follow these steps:

1. Launch an EC2 instance:
   - Choose an Amazon Linux 2 AMI.
   - Select an instance type (e.g., t3.micro for testing).
   - Configure the instance to launch in the VPC created by this stack.
   - Choose a private subnet in the VPC.
   - (Optional) Enable Auto-assign Public IP.

2. Configure Security Group:
   - Select the two security groups assigned to the two RDS instances or create a new security group.
   - (Optional) Allow inbound SSH access (port 22) from your IP address.
   - Allow outbound access to the Aurora PostgreSQL port (default 5432) for both database security groups.

3. Configure IAM Role:
   - Create an IAM role for EC2 with the following permissions:
     - AmazonRDSFullAccess (or a more restrictive custom policy for RDS access)
     - AmazonEC2RoleforSSM (for Session Manager access)

4. Launch the instance and connect using AWS Systems Manager Session Manager or (optional) via SSH using the instance key pair.

5. Install the PostgreSQL client:
   ```
   sudo yum update -y
   sudo amazon-linux-extras install postgresql13
   ```

6. Configure the PostgreSQL client to use IAM authentication:
   - Install the AWS CLI if not already present: `sudo yum install -y aws-cli`
   - Create a script to generate authentication tokens (e.g., `get-rds-token.sh`):
     ```bash
     #!/bin/bash
     aws rds generate-db-auth-token --hostname $1 --port 5432 --region $2 --username $3
     ```
   - Make the script executable: `chmod +x get-rds-token.sh`

7. Connect to the databases:
   - For the sensitive database:
     ```
     psql "host=<sensitive-db-endpoint> port=5432 dbname=<dbname> user=<iam-user> password=$(./get-rds-token.sh <sensitive-db-endpoint> <region> <iam-user>)"
     ```
   - For the published database:
     ```
     psql "host=<published-db-endpoint> port=5432 dbname=<dbname> user=<iam-user> password=$(./get-rds-token.sh <published-db-endpoint> <region> <iam-user>)"
     ```

Remember to replace `<sensitive-db-endpoint>`, `<published-db-endpoint>`, `<dbname>`, `<iam-user>`, and `<region>` with your actual values.

Note: Ensure that your EC2 instance's security group and the database security groups are configured to allow traffic on port 5432 between each other.

## Infrastructure

The HEReferenceDataPipeline infrastructure is defined using AWS SAM/AWS CloudFormation. Key resources include:

- VPC:
  - Multi-tier network with public, private, and optionally restricted subnets
  - Internet Gateway and NAT Gateways for internet connectivity
  - Configurable number of Availability Zones (1-3)

- Aurora PostgreSQL:
  - Cluster with primary and replica instances
  - Subnet group for VPC integration
  - Security group for access control
  - Parameter groups for database configuration
  - Enhanced monitoring role
  - SNS topic for notifications

- Lambda:
  - Aggregate function for data processing
  - Custom resource function for CloudFormation integration
  - Database bootstrap function for initial setup

- IAM:
  - Roles and policies for Lambda functions and RDS access
  - Optional permissions boundary

- Monitoring:
  - CloudWatch alarms for database metrics
  - SNS topics for alarm notifications

The infrastructure is designed to be scalable, secure, and compliant with educational data handling requirements.

## Backup Method

The HEReferenceDataPipeline uses Amazon Aurora PostgreSQL for its database needs. Aurora PostgreSQL provides robust, built-in backup and recovery features to ensure data durability and availability. The default backup method includes:

1. Automated Backups:
   - Aurora automatically creates and retains backups of your database cluster.
   - By default, backups are retained for 1 day, but this can be configured for up to 35 days.
   - These backups are continuous and incremental, allowing point-in-time recovery.

2. Manual Snapshots:
   - In addition to automated backups, you can create manual snapshots at any time.
   - Manual snapshots are retained until you explicitly delete them.
   - These are useful for long-term data retention or before making significant changes to your database.

3. Point-in-Time Recovery:
   - Aurora allows you to restore your database to any point in time within the backup retention period.
   - This feature helps in recovering from accidental data modifications or deletions.

4. Replication:
   - Aurora PostgreSQL uses a distributed, fault-tolerant storage system that automatically replicates your data across multiple Availability Zones in a region.
   - This provides an additional layer of data protection and high availability.

5. Cross-Region Backups:
   - For disaster recovery purposes, you can enable cross-region backups to automatically replicate your backups to another AWS region.

To modify the backup settings or implement additional backup strategies, you can update the Aurora PostgreSQL cluster configuration in the `aurora-postgres.yaml` template. For example, you might want to adjust the backup retention period or enable cross-region backups for enhanced disaster recovery capabilities.

Remember to regularly test your backup and recovery procedures to ensure they meet your Recovery Time Objective (RTO) and Recovery Point Objective (RPO) requirements.