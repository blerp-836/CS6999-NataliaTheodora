// sqlStatements.ts

export const sensitiveDbSqlStatements: Record<string, string> = {
  'Enable pg_stat_statements': 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements',
  'Enable pgaudit': 'CREATE EXTENSION IF NOT EXISTS pgaudit',
  'Create sensitive data user': 'CREATE USER {{IamUser}} with LOGIN',
  'Grant rds_iam role to user': 'GRANT rds_iam TO {{IamUser}}',
  'Grant DML privs on public schema to user': 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {{IamUser}}',
  'Grant usage on public schema to user': 'GRANT USAGE ON SCHEMA public TO {{IamUser}}',
  'Set default table privileges for user': 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {{IamUser}}',
  'Create raw events table': 'CREATE TABLE IF NOT EXISTS raw_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_type VARCHAR(64), type_version VARCHAR(16), event JSONB NOT NULL, create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
};

export const publishDbSqlStatements: Record<string, string> = {
  'Enable pg_stat_statements': 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements',
  'Enable pgaudit': 'CREATE EXTENSION IF NOT EXISTS pgaudit',
  'Create publish data user': 'CREATE USER {{IamUser}} with LOGIN',
  'Grant rds_iam role to user': 'GRANT rds_iam TO {{IamUser}}',
  'Grant DML privs on public schema to user': 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA PUBLIC TO {{IamUser}}',
  'Grant usage on public schema to user': 'GRANT USAGE, CREATE ON SCHEMA PUBLIC TO {{IamUser}}',
  'Set default table privileges for user': 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {{IamUser}}',

  'Create ro user': `CREATE USER {{ReadOnlyUser}} with PASSWORD '{{ReadOnlyPass}}'`,
  'Grant select privs on public schema to ro user': 'GRANT SELECT ON ALL TABLES IN SCHEMA PUBLIC TO {{ReadOnlyUser}}',
  'Set default table privileges for ro user': 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO {{ReadOnlyUser}}',

  'Create pseudo anonymized events table': 'CREATE TABLE IF NOT EXISTS published_events (id bigint PRIMARY KEY, event_type VARCHAR(64), type_version VARCHAR(16), event JSONB NOT NULL, create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
};