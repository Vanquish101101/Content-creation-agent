-- Размер файла в байтах — нужен для подсчёта использования хранилища R2 (общего
-- и по каждому telegram_id), см. src/quota/storageUsage.js. NULL для текстовой
-- генерации (Слайс 2, файлов не создаёт) и для строк, созданных до этой миграции.

ALTER TABLE content_creation_agent.generated_content ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
