-- Обратный канал Агент 4 → Агент 1 (Слайс 8/9/квота) — зеркало уже реализованных
-- хендоффов (intelligence_agent.agent4_handoff_queue,
-- information_analysis_agent.agent4_handoff_queue), но в обратную сторону.
-- message_type различает поводы обращения к Агенту 1 через один и тот же канал:
-- 'content_ready' (Слайс 9, отчёт о готовом контенте), 'quota_warning' (лимит R2),
-- 'moderation_request' (Слайс 8, подтверждение публикации) и т.д.
-- См. src/delivery/agent1Notifier.js.

CREATE TABLE IF NOT EXISTS content_creation_agent.agent1_delivery_queue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id           BIGINT NOT NULL,
  message_type          TEXT NOT NULL,
  generated_content_id  UUID REFERENCES content_creation_agent.generated_content(id),
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at       TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE content_creation_agent.agent1_delivery_queue ENABLE ROW LEVEL SECURITY;

GRANT ALL ON content_creation_agent.agent1_delivery_queue TO anon, authenticated, service_role;
