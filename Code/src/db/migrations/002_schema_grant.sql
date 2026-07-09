-- Fix (найден живой проверкой 2026-07-10): миграция 001 давала GRANT только на
-- таблицы, но не на саму схему — в Postgres этого недостаточно, GRANT на таблицу
-- не работает без предварительного GRANT USAGE ON SCHEMA. Ошибка проявлялась как
-- "permission denied for schema content_creation_agent" при первом реальном
-- обращении через service_role. У остальных трёх агентов (intelligence_agent,
-- deep_parsing_agent, information_analysis_agent) это уже было сделано —
-- воспроизводим тот же паттерн здесь.
GRANT USAGE ON SCHEMA content_creation_agent TO service_role;
GRANT USAGE ON SCHEMA content_creation_agent TO anon;
GRANT USAGE ON SCHEMA content_creation_agent TO authenticated;
