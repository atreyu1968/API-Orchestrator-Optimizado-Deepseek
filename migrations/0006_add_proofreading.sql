CREATE TABLE IF NOT EXISTS proofreading_projects (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  genre TEXT,
  author_style TEXT,
  language TEXT DEFAULT 'es',
  total_chapters INTEGER NOT NULL DEFAULT 0,
  processed_chapters INTEGER NOT NULL DEFAULT 0,
  total_changes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proofreading_chapters (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES proofreading_projects(id) ON DELETE CASCADE,
  chapter_number TEXT NOT NULL,
  title TEXT,
  original_content TEXT NOT NULL,
  corrected_content TEXT,
  changes JSONB DEFAULT '[]',
  total_changes INTEGER NOT NULL DEFAULT 0,
  quality_level TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
);
