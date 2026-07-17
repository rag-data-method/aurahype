-- Schema D1 do acervo Tríade 56.
-- Roda com: npm run db:init:remote

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,               -- hash sha256 do source_url, ou uuid do scraper
  source_url TEXT NOT NULL UNIQUE,   -- URL original do Lovable (ou origem)
  title TEXT,
  description TEXT,
  html_snippet TEXT,                 -- HTML resumido, ~2-4KB
  screenshot_url TEXT,               -- opcional
  -- Metadados extraídos pelo scraper (opcionais, se o scraper mandar)
  palette_hex TEXT,                  -- JSON array: ["#a78bfa","#34d399",...]
  hero_kind TEXT,                    -- "image"|"video"|"gradient"|"text"|null
  language TEXT,                     -- "pt"|"en"|null
  -- Classificação feita pelo LLM em /classify (ou inline no /ingest)
  category TEXT,                     -- ex: "fitness","tech","food","beauty","service"
  style TEXT,                        -- ex: "minimal","bold","organic","brutalist"
  vibe TEXT,                         -- "warm"|"cool"|"neutral"|"dark"|"bright"
  tags TEXT,                         -- JSON array livre: ["hero-video","glassmorphism",...]
  classified_at INTEGER,             -- ms epoch quando foi classificado
  -- Housekeeping
  ingested_at INTEGER NOT NULL,      -- ms epoch
  updated_at INTEGER NOT NULL,
  raw_json TEXT                      -- payload cru completo (fallback)
);

CREATE INDEX IF NOT EXISTS idx_sites_category ON sites(category);
CREATE INDEX IF NOT EXISTS idx_sites_style    ON sites(style);
CREATE INDEX IF NOT EXISTS idx_sites_vibe     ON sites(vibe);
CREATE INDEX IF NOT EXISTS idx_sites_ingested ON sites(ingested_at DESC);
