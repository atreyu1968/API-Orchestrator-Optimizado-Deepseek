ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_subtype TEXT NOT NULL DEFAULT 'standard';
