ALTER TABLE world_bibles ADD COLUMN IF NOT EXISTS author_notes jsonb DEFAULT '[]'::jsonb;
ALTER TABLE reedit_world_bibles ADD COLUMN IF NOT EXISTS author_notes jsonb DEFAULT '[]'::jsonb;
