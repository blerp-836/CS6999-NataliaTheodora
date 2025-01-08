import { Client } from 'pg';
import { Signer } from "@aws-sdk/rds-signer";
import fs from 'fs/promises';
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
export function ensureEnvVar(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Environment variable ${name} is not set`);
    }
    return value;
}
/**
 * Retrieves an authentication token for database connection using AWS IAM authentication.
 *
 * @param {string} dbHost - The host name of the database
 * @param {string} dbPort - The port number of the database
 * @param {string} dbIamUser - The IAM user for database authentication
 * @param {string} awsRegion - The AWS region where the database is located
 *
 * @returns {Promise<string>} A promise that resolves to the authentication token
 * @throws {Error} If token generation fails
 */
async function getAuthToken(dbHost, dbPort, dbIamUser, awsRegion) {
    const signer = new Signer({
        hostname: dbHost,
        port: parseInt(dbPort, 10),
        region: awsRegion,
        username: dbIamUser
    });
    return signer.getAuthToken();
}
/**
 * Creates a new database connection using AWS IAM authentication.
 *
 * @param {string} dbHost - The host name of the database
 * @param {string} dbPort - The port number of the database
 * @param {string} dbName - The name of the database
 * @param {string} dbIamUser - The IAM user for database authentication
 * @param {string} awsRegion - The AWS region where the database is located
 *
 * @returns {Promise<Client>} A promise that resolves to a connected PostgreSQL client
 * @throws {Error} If connection creation fails
 */
export async function createDbConnection(dbHost, dbPort, dbName, dbIamUser, awsRegion) {
    const authToken = await getAuthToken(dbHost, dbPort, dbIamUser, awsRegion);
    const clientConfig = {
        host: dbHost,
        port: parseInt(dbPort, 10),
        database: dbName,
        user: dbIamUser,
        password: authToken,
        ssl: {
            rejectUnauthorized: false,
            ca: fs.readFile('/opt/ssl/rds-combined-ca-bundle.pem').toString(),
        }
    };
    const client = new Client(clientConfig);
    await client.connect();
    return client;
}
