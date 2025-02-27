import * as AWS from 'aws-sdk';
import { Client, ClientConfig } from 'pg';
import { sensitiveDbSqlStatements, publishDbSqlStatements } from './sqlStatements';
import * as fs from 'fs';

const logger = console;

const masterSecretArn = ensureEnvVar('MasterUserSecretArn');
const readOnlyUserSecretArn = ensureEnvVar('ReadOnlyUserSecretArn');
const dbHost = ensureEnvVar('DBHost');
const dbPort = ensureEnvVar('DBPort');
const dbName = ensureEnvVar('DBName');
const dbType = ensureEnvVar('DbType');
const iamUser = ensureEnvVar('IamUser');
const awsRegion = ensureEnvVar('AwsRegion');

/**
 * Ensures that a required environment variable is set and returns its value.
 * 
 * @param {string} name - The name of the environment variable to check
 * @returns {string} The value of the environment variable
 * @throws {Error} If the environment variable is not set or is empty
 * 
 * @example
 * try {
 *   const apiKey = ensureEnvVar('API_KEY');
 *   // Use apiKey...
 * } catch (error) {
 *   console.error('Missing required environment variable:', error.message);
 * }
 */
function ensureEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

/**
 * @interface SecretValue
 * @description Represents the structure of the secret retrieved from AWS Secrets Manager
 * 
 * @property {string} username - Database username
 * @property {string} password - Database password
 */
interface SecretValue {
  username: string;
  password: string;
}

/**
 * Retrieves a secret value from AWS Secrets Manager
 * 
 * @param {string} secretArn - The ARN of the secret to retrieve
 * @param {string} awsRegion - AWS region where the secret is stored
 * @returns {Promise<SecretValue>} A promise that resolves to the secret value as a parsed JSON object
 * @throws {Error} If the secret cannot be retrieved or is not a string
 * 
 * @example
 * try {
 *   const secret = await getSecret('arn:aws:secretsmanager:region:id:secret', 'us-west-2');
 *   console.log(secret.username); // Access secret values
 * } catch (error) {
 *   logger.error('Failed to retrieve secret:', error);
 * }
 */
async function getSecret(secretArn: string, awsRegion: string): Promise<SecretValue> {
  const client = new AWS.SecretsManager({ region: awsRegion });

  try {
    const response = await client.getSecretValue({ SecretId: secretArn }).promise();
    if ('SecretString' in response) {
      const secret = JSON.parse(response.SecretString);
      return secret;
    } else {
      throw new Error('Secret is not a string');
    }
  } catch (error) {
    logger.error(`Error retrieving secret: ${error}`);
    throw error;
  }
}

/**
 * Executes a series of SQL statements sequentially
 * 
 * @param {Client} client - PostgreSQL client instance
 * @param {Object.<string, string>} sqlStatements - Object containing named SQL statements
 * @returns {Promise<void>} A promise that resolves when all statements are executed
 * @throws {Error} If any SQL statement fails to execute
 * 
 * @example
 * const statements = {
 *   createTable: 'CREATE TABLE users (...)',
 *   addIndex: 'CREATE INDEX ON users (...)'
 * };
 * await executeSqlStatements(client, statements);
 */
async function executeSqlStatements(client: Client, sqlStatements: { [key: string]: string }): Promise<void> {


  const secret = await getSecret(readOnlyUserSecretArn, awsRegion);
  console.log('ro secret retrieved');

  for (const [statementName, statement] of Object.entries(sqlStatements)) {
    logger.info(`Executing SQL statement: ${statementName}`);
    try {
      if (dbType === 'sensitive') {
        const sql = statement.replace('{{IamUser}}', iamUser);
        await client.query(sql);
      } else {
        const secret = await getSecret(readOnlyUserSecretArn, awsRegion);
        console.log('ro secret retrieved');

        const sql = statement
        .replace('{{IamUser}}', iamUser)
        .replace('{{ReadOnlyUser}}', secret.username)
        .replace('{{ReadOnlyPass}}', secret.password);
        await client.query(sql);
      }
    } catch(e) {
      logger.error(`statement failed: ${statementName}, ${e}`);
    }
  }
}

/**
 * AWS Lambda handler for database bootstrapping operations
 * 
 * @param {any} event - Lambda event object containing RequestType
 * @param {any} context - Lambda context object
 * @returns {Promise<Object>} A promise that resolves to an object containing:
 *   - status: 'SUCCESS' or 'FAILED'
 *   - responseData: Object containing operation results or error information
 * 
 * @description
 * This handler manages database initialization operations:
 * - Retrieves database credentials from AWS Secrets Manager
 * - Establishes SSL-enabled PostgreSQL connection
 * - Executes initialization SQL statements for 'Create' operations
 * - Handles cleanup and connection termination
 * 
 * @example
 * // Event structure
 * {
 *   "RequestType": "Create",  // Supported: "Create"
 *   // ... other CloudFormation custom resource properties
 * }
 * 
 * @throws {Error} If database operations fail or unsupported RequestType is received
 */
/* eslint-disable  @typescript-eslint/no-explicit-any */
export async function handler(event: any, context: any) {
  let client: Client | null = null;
  console.log(JSON.stringify(event));
  console.debug(JSON.stringify(context));

  try {
    const responseData: { [key: string]: string } = {};

    const secret = await getSecret(masterSecretArn, awsRegion);
    console.log('secret retrieved');

    const clientConfig: ClientConfig = {
      host: dbHost,
      port: parseInt(dbPort, 10),
      database: dbName,
      user: secret.username,
      password: secret.password,
      ssl: {
        rejectUnauthorized: false,
        ca: fs.readFileSync('/opt/rds-combined-ca-bundle.pem').toString(),
      },
    };

    client = new Client(clientConfig);
    await client.connect();
    logger.info('SUCCESS: Connection to RDS PostgreSQL instance succeeded');

    if (event.RequestType === 'Create') {
      const sqlStatements = dbType === 'sensitive' ? sensitiveDbSqlStatements : publishDbSqlStatements;
      await executeSqlStatements(client, sqlStatements);
      responseData.Data = 'SUCCESS: Executed SQL statements successfully.';
    } else if (event.RequestType === 'Update') {
      responseData.Data = 'Update: Update not supported, but not a failure either.';
    } else {
      responseData.Data = `${event.RequestType} is an unsupported stack operation for this lambda function.`;
      return {
        status: 'FAILED',
        responseData: responseData
      };
    }

    return {
      status: 'SUCCESS',
      responseData: responseData
    };
  } catch (error) {
    logger.error(`Exception: ${error}`);
    const responseData = { Data: error.toString() };
    return {
      status: 'FAILED',
      responseData: responseData
    };
  } finally {
    if (client) {
      await client.end();
    }
  }
}
