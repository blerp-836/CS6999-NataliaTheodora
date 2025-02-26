CREATE TABLE IF NOT EXISTS caliper_published_events_count (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, 
  user_id TEXT,
  course_id TEXT,
  event_type VARCHAR(64),
  year INTEGER, 
  month INTEGER, 
  day_of_month INTEGER,
  day_of_week INTEGER,
  hour INTEGER,
  total INTEGER
);

CREATE INDEX user_id_idx ON caliper_published_events_count(user_id);
CREATE INDEX course_id_idx ON caliper_published_events_count(course_id);