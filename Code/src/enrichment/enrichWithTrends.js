// src/enrichment/enrichWithTrends.js
// Опциональное обогащение трендовыми данными (см. «07. Архитектура», §5) —
// вызывается только когда wizard просит опору на тренды
// (wantsTrendEnrichment). Поля hooks/triggers/offers/viral_reasons/
// content_ideas формирует Агент 2 при парсинге (combined_analysis, см. «02.
// Анализ», §1.2) — их нет в дайджесте Агента 3 (там только subject/
// predicate/object факты), поэтому путь такой: дайджест → детали факта →
// raw_job_id источника → сырой результат парсинга Агента 2 → combined_analysis.
//
// MVP-упрощение: берётся ПЕРВЫЙ факт дайджеста и его ПЕРВЫЙ источник, без
// семантического сопоставления с темой wizard-запроса — реальное
// сопоставление по теме помечено как "задача LLM-фильтра внутри Агента 4" в
// самой «07. Архитектура», §5.2, и намеренно не реализовано в этом слайсе.
//
// Best-effort: любая ошибка (Агент 3 недоступен, сырых данных нет и т.д.) —
// не бросает исключение, просто возвращает null, генерация продолжается без
// обогащения, а не падает целиком.
import { wantsTrendEnrichment } from './classifyTrendRequest.js';
import { fetchRawParsingResult } from './rawDataReaders.js';

export function createTrendEnrichment({ db, analysisClient }) {
  return async function enrichWithTrends(wizard) {
    if (!wantsTrendEnrichment(wizard.description)) {
      return null;
    }

    try {
      const digest = await analysisClient.getDigest();
      const fact = digest?.facts?.[0];
      if (!fact) {
        return null;
      }

      const detail = await analysisClient.getDetail(fact.detail_ref);
      const rawJobId = detail?.sources?.[0]?.ref;
      if (!rawJobId) {
        return null;
      }

      const raw = await fetchRawParsingResult(db, rawJobId);
      return raw?.combined_analysis ?? null;
    } catch (err) {
      console.warn(`[enrichWithTrends] best-effort enrichment failed, continuing without it: ${err.message}`);
      return null;
    }
  };
}
