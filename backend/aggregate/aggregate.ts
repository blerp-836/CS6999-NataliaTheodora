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

    const dateMinusOneHour = getDateMinusOneHour()

    await deleteSincePastHour(client, dateMinusOneHour);

    let page = 0;
    let result = null;
    const pageSize = 1000;
    do {
      result = await getPaginatedData(client, dateMinusOneHour, page, pageSize);
      await insertAggregatedData(client, result);
      page++;
    } while (result && result.rows && result.rows.length > 0);

    return {
      status: JSON.stringify({
        message: 'Data aggregated successfully'
      })
    };
  } catch (error) {
    console.error('Database error:', error);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

async function deleteSincePastHour(client: Client | null, dateMinusOneHour: any) {
  // delete counts that may have already been calculated for this hour to avoid duplication.
  const deleteEventCountsInLastHour = `DELETE FROM caliper_published_events_count WHERE year=$1 AND month=$2 AND day_of_month=$3 AND day_of_week=$4 AND hour >= $5;`
  await client.query(deleteEventCountsInLastHour, [
    dateMinusOneHour.getUTCFullYear(), 
    dateMinusOneHour.getUTCMonth() + 1, 
    dateMinusOneHour.getUTCDate(), 
    dateMinusOneHour.getUTCDay(), 
    dateMinusOneHour.getUTCHours()
  ]);
}

async function getPaginatedData(client: Client | null, dateMinusOneHour: any, page: number, pageSize: number) {
  try {
    const offset = (page - 1) * pageSize;
    const selectEventCountsInLastHour = `
    SELECT event->'group'->'courseNumber' AS course_id, event->'actor'->'id' AS user_id, COUNT(*) AS total, event_type, DATE_TRUNC('hour', create_date) as create_date_trunc
        FROM caliper_published_events 
        WHERE create_date >= $1
        GROUP BY course_id, user_id, event_type, create_date_trunc
        LIMIT $2 OFFSET $3;`;
    const result = await client.query(selectEventCountsInLastHour, [dateMinusOneHour.toISOString(), pageSize, offset]);
    return result.rows;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  } finally {
    await client.end();
  }
}

async function insertAggregatedData(client: Client | null, result: any) {
  const data = [];
  for(const row of result.rows) {
    const createDateTruncated = new Date(row.create_date_trunc);
    const values = [ 
      row.user_id, 
      row.course_id, 
      row.event_type, 
      createDateTruncated.getUTCFullYear(), 
      createDateTruncated.getUTCMonth() + 1, 
      createDateTruncated.getUTCDate(),
      createDateTruncated.getUTCDay(),
      createDateTruncated.getUTCHours(),
      row.total
    ];
    data.push(values);
  }
  if (data.length > 0) {
    const insertGroupedCounts = `INSERT INTO caliper_published_events_count(user_id, course_id, event_type, year, month, day_of_month, day_of_week, hour, total) VALUES ${getValuesPlaceholder(data, 9)}`;
    await client.query(insertGroupedCounts, data.flat());
  }
}

function getValuesPlaceholder(valuesToBeInserted: any[], numberOfColumns: number) {
  const valuesPlaceholder = `${valuesToBeInserted.map((row, i) => {
    let valuePlaceholder = [];
    for (let j = 0; j < numberOfColumns; j++) {
      valuePlaceholder.push(`$${i * numberOfColumns + (j+1)}`);
    }
    return `(${valuePlaceholder.join(',')})`;
  }).join(',')}`;
  return valuesPlaceholder;
}

function getDateMinusOneHour() {
  const date = new Date();
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  const dateMinusOneHour = new Date(date);
  dateMinusOneHour.setHours(dateMinusOneHour.getHours() - 1);
  return dateMinusOneHour;
}