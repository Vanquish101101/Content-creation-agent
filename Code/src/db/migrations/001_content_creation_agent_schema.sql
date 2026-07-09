-- Content creation agent (Агент 4) — базовая схема.
-- Схема content_creation_agent уже зарезервирована в общем Supabase-проекте Marketing agency
-- (id wklecdbujgdwnbmfmggi) с самого начала 4-агентного разделения — см. память проекта.
-- См. «07. Архитектура (Бекенд).md», §6 для полного обоснования каждой таблицы.

CREATE TABLE IF NOT EXISTS content_creation_agent.generated_content (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id     BIGINT NOT NULL,
  wizard_hash     TEXT NOT NULL,
  run_id          UUID,                              -- прогон Агента 3, если использовалось обогащение трендами
  type            TEXT NOT NULL,                      -- text | image | video | audio
  r2_url          TEXT,
  social_target   TEXT[],
  status          TEXT NOT NULL DEFAULT 'pending',    -- pending|processing|done|error|published|publish_failed
  publish_report  JSONB,
  cost_usd        NUMERIC,
  metadata        JSONB,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Дедупликация wizard-запросов: не генерировать дважды один и тот же запрос.
CREATE TABLE IF NOT EXISTS content_creation_agent.processed_wizard_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id     BIGINT NOT NULL,
  wizard_hash     TEXT NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telegram_id, wizard_hash)
);

-- Входящие события от обоих отправителей (Агент 1 — wizard_ready, Агент 3 — digest_ready).
CREATE TABLE IF NOT EXISTS content_creation_agent.inbox_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,                      -- 'agent1_wizard' | 'agent3_digest'
  ref             TEXT NOT NULL,                       -- wizard_hash (agent1) или run_id (agent3)
  telegram_id     BIGINT,                              -- заполнено только для agent1_wizard
  status          TEXT NOT NULL DEFAULT 'pending',     -- pending|processed|skipped
  received_via    TEXT NOT NULL,                       -- 'redis' | 'poll'
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE content_creation_agent.generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_creation_agent.processed_wizard_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_creation_agent.inbox_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON content_creation_agent.generated_content TO anon, authenticated, service_role;
GRANT ALL ON content_creation_agent.processed_wizard_requests TO anon, authenticated, service_role;
GRANT ALL ON content_creation_agent.inbox_events TO anon, authenticated, service_role;
