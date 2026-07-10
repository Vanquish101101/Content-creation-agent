// src/delivery/buildContentReport.js
// Короткий отчёт о готовом контенте (Слайс 9) — доставляется Агенту 1 через
// notifyAgent1 (message_type: 'content_ready'). Не пачка файлов, а
// пометки+ссылка (см. «05. ТЗ», §4.3, «04. Брейншторм», §5): соцсеть, тип,
// краткое описание задачи, размер файла, готовый текст (для text — своего
// файла в R2 нет, доставляется прямо в отчёте), результат публикации, если
// был (Слайс 8), фактическая стоимость генерации (Слайс 12 — costUsd уже
// считается с самого Слайса 2, здесь только доносится до пользователя).
// Ссылка на скачивание (presigned R2 URL) добавляется вызывающим кодом
// (generate.js) — здесь только синхронная часть, без обращения к R2.
const DESCRIPTION_PREVIEW_LENGTH = 200;

function previewDescription(description) {
  if (!description || description.length <= DESCRIPTION_PREVIEW_LENGTH) {
    return description;
  }
  return `${description.slice(0, DESCRIPTION_PREVIEW_LENGTH)}…`;
}

export function buildContentReport({ wizard, result, publishReport }) {
  return {
    network: wizard.network,
    contentType: wizard.content_type,
    description: previewDescription(wizard.description),
    text: result.text ?? null,
    sizeBytes: result.sizeBytes ?? null,
    costUsd: result.costUsd ?? null,
    ...(publishReport ? { publishReport } : {})
  };
}
