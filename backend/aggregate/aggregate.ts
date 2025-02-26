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


async function aggregate(): Promise<any> {
  let client: Client | null = null;

  try {
    client = await createDbConnection(dbHost, dbPort, dbName, dbIamUser, awsRegion);

    const selectEventCountsInLastHour = `
      SELECT event->'group'->'courseNumber' AS course_id, event->'actor'->'id' AS user_id, COUNT(*) AS total, event_type  
	        FROM caliper_published_events 
	        WHERE create_date >= NOW() - INTERVAL '1 HOURS'
	        GROUP BY course_id, user_id, event_type;`;
    
    const result = await client.query(selectEventCountsInLastHour);

    const data = [];
    for(const row of result.rows) {
      var date = new Date(row.create_date);
      const values = [ 
        row.user_id, 
        row.course_id, 
        row.event_type, 
        date.getUTCFullYear(), 
        date.getUTCMonth(), 
        date.getUTCDate(),
        date.getUTCDay(),
        date.getUTCHours(),
        row.total
      ];
      data.push(values);
    }

    const insertGroupedCounts = `INSERT INTO caliper_published_events_count(user_id, course_id, event_type, year, month, day_of_month, day_of_week, hour, total) VALUES ${data.map((row) => `($1, $2, $3, $4, $5, $6, $7, $8, $9)`).join(',')}`;
    await client.query(insertGroupedCounts, data.flat());

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