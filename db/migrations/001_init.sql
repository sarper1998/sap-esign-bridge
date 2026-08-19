CREATE TABLE IF NOT EXISTS signbridge_jobs (
  id text PRIMARY KEY,
  sap_event_id text NOT NULL UNIQUE,
  status text NOT NULL,
  document_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS signbridge_jobs_status_idx ON signbridge_jobs (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS signbridge_jobs_signature_idx ON signbridge_jobs ((payload #>> '{signature,requestId}'));
