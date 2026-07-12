// src/generation/carousel/cascade.js
// Каскад генерации карусели (несколько изображений на один пост) — тип
// контента 'carousel' в wizard'е Агента 1 (кнопка "🧵 Карусель"), до
// 2026-07-11 не был реализован ни в одном каскаде — normalizeWizardContentType
// намеренно оставлял его несопоставленным, роутер падал с понятной
// "unknown content_type" (не баг именования — отсутствующая функциональность,
// см. normalizeWizardContentType.js).
//
// Переиспользует createImageCascade (Runway) N раз — ничего нового по части
// генерации одного изображения не изобретаем: тот же cheap→main каскад,
// то же обогащение трендами (Слайс 7), та же загрузка в R2, для каждого
// изображения по отдельности.
import { createImageCascade } from '../image/cascade.js';

const DEFAULT_IMAGE_COUNT = 3;

export function createCarouselCascade({ apiKey, r2, imageCount = DEFAULT_IMAGE_COUNT, ...imageOpts } = {}) {
  // createImageCascade сам проверяет apiKey/r2 и бросает с тем же текстом
  // ошибки — не дублируем проверку, просто даём ей случиться на первом же
  // вызове ниже (до генерации самого wizard'а).
  const generateImage = createImageCascade({ apiKey, r2, ...imageOpts });

  return async function generateCarousel(wizard) {
    const results = [];
    for (let i = 0; i < imageCount; i += 1) {
      // Последовательно, не Promise.all — конкурентные задачи на один и тот
      // же Runway-аккаунт создают риск упереться в rate limit, а порядок
      // изображений в карусели не важен для параллелизации (нет
      // зависимости между кадрами).
      const result = await generateImage(wizard);
      results.push(result);
    }

    return {
      files: results.map((r) => ({ r2Url: r.r2Url, sizeBytes: r.sizeBytes })),
      costUsd: results.reduce((sum, r) => sum + r.costUsd, 0),
      tier: results[0].tier,
      model: results[0].model
    };
  };
}
