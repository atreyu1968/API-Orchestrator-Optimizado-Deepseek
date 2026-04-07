ALTER TABLE project_back_matter ADD COLUMN IF NOT EXISTS enable_author_page BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE project_back_matter ADD COLUMN IF NOT EXISTS author_page_bio TEXT;
