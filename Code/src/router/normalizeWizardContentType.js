// src/router/normalizeWizardContentType.js
// Wizard Агента 1 предлагает 6 кнопок типа контента (post/video/photo/audio/
// reels/carousel, см. WIZARD_TYPE_KB в его telegram-bot/index.js), а
// routeByContentType понимает text/image/video/audio/carousel (Слайсы 2,
// 4-6, carousel добавлен 2026-07-11). Найдено живой проверкой 2026-07-10:
// реальный wizard с типом "Пост" (content_type: 'post') падал с "unknown
// content_type" на каждом тике 30-секундного поллинга — навсегда, retry не
// помогал, потому что это не транзиентная ошибка, а постоянное расхождение
// имён.
const WIZARD_TO_ROUTER_CONTENT_TYPE = {
  post: 'text',
  photo: 'image',
  reels: 'video'
  // 'carousel' и 'audio' сознательно не перечислены здесь — их имена в
  // wizard'е уже совпадают 1-в-1 с именами роутера, сопоставлять нечего.
};

export function normalizeWizardContentType(contentType) {
  return WIZARD_TO_ROUTER_CONTENT_TYPE[contentType] ?? contentType;
}
