import { ensureEnvVar, createDbConnection } from './utils.ts';
import { Client } from 'pg';

// RDS settings
const dbHost = ensureEnvVar('DBHost');
const dbPort = ensureEnvVar('DBPort');
const dbName = ensureEnvVar('DBName');
const dbIamUser = ensureEnvVar('DBIamUser');
const awsRegion = ensureEnvVar('AwsRegion');

export const handler = async () => {
  const result = await aggregate();
  return result.status;
};

/**
 * Runs aggregation queries on data in the published database.
 * 
 * @returns {Promise<Object>} A promise that resolves to an object containing:
 *   - status: JSON string with message, id, and timestamp
 * @throws {Error} If database operations fail
 * 
 * @example
 * try {
 *   const result = await aggregate();
 *   console.log(result.status);
 * } catch (error) {
 *   console.error('Failed to aggregate data:', error);
 * }
 */
async function aggregate(): Promise<any> {
  let client: Client | null = null;

  try {
    client = await createDbConnection(dbHost, dbPort, dbName, dbIamUser, awsRegion);

    // Prepare the eventCounts aggregation 
    const dropEventCounts = `DROP TABLE IF EXISTS caliper_event_counts`;
    const eventCounts = `
      CREATE TABLE caliper_event_counts
      AS
      SELECT event_type, count(*) 
      FROM caliper_published_events GROUP BY event_type`;
    
    await client.query(dropEventCounts);
    await client.query(eventCounts);

    return {
      status: JSON.stringify({
        message: 'Data aggregated successfully'
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    
    // More specific error handling
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

  } finally {
    if (client) {
      await client.end();
    }
  }
}