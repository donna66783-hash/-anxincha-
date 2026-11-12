CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),
  report_type TEXT NOT NULL,
  report_text TEXT,
  context_text TEXT,
  analysis_state TEXT NOT NULL,
  analysis_category TEXT NOT NULL,
  analysis_score INTEGER NOT NULL,
  consent_case_storage INTEGER NOT NULL,
  consent_research INTEGER NOT NULL,
  consent_model_training INTEGER NOT NULL,
  source_rights_confirmed INTEGER NOT NULL,
  attachment_consent INTEGER NOT NULL,
  deletion_token_hash TEXT NOT NULL,
  reviewer_note TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX reports_status_created_idx ON reports(status, created_at DESC);

CREATE TABLE report_attachments (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX report_attachments_report_idx ON report_attachments(report_id);

CREATE TABLE community_records (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
  source_label TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  category TEXT NOT NULL,
  public_summary TEXT NOT NULL,
  min_signals INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE community_signals (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES community_records(id) ON DELETE CASCADE,
  literal_pattern TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL
);

CREATE INDEX community_signals_record_idx ON community_signals(record_id);

