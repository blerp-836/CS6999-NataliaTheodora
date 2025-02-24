CREATE TABLE IF NOT EXISTS eduapi_published_events (
  id bigint PRIMARY KEY, 
  type_version VARCHAR(16), 
  event_type VARCHAR(64),
  event JSONB NOT NULL, 
  create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caliper_published_events (
  id bigint PRIMARY KEY, 
  type_version VARCHAR(16), 
  event_type VARCHAR(64),
  event JSONB NOT NULL, 
  create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS published_events;
