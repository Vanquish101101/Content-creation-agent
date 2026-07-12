// src/generation/buildTrendParts.js
// Общая функция для text/image/video каскадов — извлекает непустые
// смысловые части wizard.trendContext (см. enrichWithTrends.js) в
// единообразные строки "метка: содержимое". Формат финального включения в
// промпт — дело каждого каскада (text использует многострочный блок с
// заголовками, image/video — компактную вставку в единый текстовый промпт
// генеративной модели), но список меток и извлечение значений — общие,
// чтобы не разъезжались при правках.
const LABELS = [
  ['hooks', 'хук (открывающая фраза, похожий стиль)'],
  ['triggers', 'триггеры вовлечения'],
  ['offers', 'оффер/призыв'],
  ['viral_reasons', 'что делает контент виральным'],
  ['content_ideas', 'идеи подачи']
];

export function buildTrendParts(trendContext) {
  if (!trendContext) {
    return [];
  }
  const parts = [];
  for (const [key, label] of LABELS) {
    const values = trendContext[key];
    if (values?.length) {
      parts.push(`${label}: ${values.join('; ')}`);
    }
  }
  return parts;
}
