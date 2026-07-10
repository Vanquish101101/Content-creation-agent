// src/router/normalizeWizardContentType.js
// Wizard Агента 1 предлагает 6 кнопок типа контента (post/video/photo/audio/
// reels/carousel, см. WIZARD_TYPE_KB в его telegram-bot/index.js), а
// routeByContentType понимает только text/image/video/audio (Слайсы 2, 4-6).
// Найдено живой проверкой 2026-07-10: реальный wizard с типом "Пост"
// (content_type: 'post') падал с "unknown content_type" на каждом тике
// 30-секундного поллинга — навсегда, retry не помогал, потому что это не
// транзиентная ошибка, а постоянное расхождение имён.
const WIZARD_TO_ROUTER_CONTENT_TYPE = {
  post: 'text',
  photo: 'image',
  reels: 'video'
  // 'carousel' сознательно не сопоставлен — мультиизображение не реализовано
  // ни в одном каскаде (Слайсы 4-6 — один файл на генерацию), это не баг
  // именования, а отсутствующая функциональность. Остаётся падать с понятной
  // "unknown content_type" — см. route.test.js.
};

export function normalizeWizardContentType(contentType) {
  return WIZARD_TO_ROUTER_CONTENT_TYPE[contentType] ?? contentType;
}
