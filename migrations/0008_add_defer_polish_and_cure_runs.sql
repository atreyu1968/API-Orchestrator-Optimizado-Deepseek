-- [Fix204] Flag para diferir el pulido post-finalizacion a la Cura de Serie
ALTER TABLE projects ADD COLUMN IF NOT EXISTS defer_polish_to_cure boolean NOT NULL DEFAULT false;

-- [Fix205] Persistencia del estado de la Cura de Serie (resistente a reinicios)
CREATE TABLE IF NOT EXISTS series_cure_runs (
  id serial PRIMARY KEY,
  series_id integer NOT NULL,
  status text NOT NULL,
  state jsonb NOT NULL,
  started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
