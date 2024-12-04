CREATE TABLE IF NOT EXISTS published_events (
  id bigint PRIMARY KEY, 
  event_type VARCHAR(64), 
  type_version VARCHAR(16), 
  event JSONB NOT NULL, 
  create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
