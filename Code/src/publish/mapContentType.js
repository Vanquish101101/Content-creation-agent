// src/publish/mapContentType.js
// Маппинг content_type/format (Слайс 2) → publication_type PostMyPost.
// PostMyPost publication_type: 1 — post, 2 — story, 4 — reels/shorts/clips
// (см. help.postmypost.io/docs/api/create-publication).
//
// НЕ ПОДТВЕРЖДЕНО ЖИВЫМ ВЫЗОВОМ: точный формат строки `wizard.format` для
// вертикального 9:16 нигде не зафиксирован документами Агента 1 («9:16/16:9/
// 1:1 и др.», без строгой схемы) — здесь предполагается совпадение с '916'
// или '9:16', по образцу уже используемых в тестах значений. Если реальный
// wizard отдаёт другой формат записи — первое, что нужно перепроверить.
//
// audio осознанно не маппится: у PostMyPost нет понятия "аудио-публикация"
// (это SMM-сервис для постов/историй/roles, не подкастов) — публикация чистого
// аудио-файла через этот API невозможна в принципе, не только не реализована.

const PUBLICATION_TYPE = { POST: 1, STORY: 2, REELS: 4 };
const VERTICAL_FORMATS = ['916', '9:16'];

export function mapContentTypeToPublicationType(contentType, format) {
  if (contentType === 'audio') {
    throw new Error('mapContentTypeToPublicationType: PostMyPost has no audio-post concept, "audio" cannot be published');
  }
  if (contentType === 'video' && VERTICAL_FORMATS.includes(format)) {
    return PUBLICATION_TYPE.REELS;
  }
  return PUBLICATION_TYPE.POST;
}
