// src/enrichment/enrichWithTrends.js
// Обогащение трендовыми данными (см. «07. Архитектура», §5) — вызывается
// только когда wizard ЯВНО просит опору на тренды (wizard.use_trends === true,
// вопрос "На основе трендов" / "Просто по описанию" на шаге 1 wizard'а Агента
// 1). Поля hooks/triggers/offers/viral_reasons/content_ideas формирует Агент
// 2 при парсинге (combined_analysis, см. «02. Анализ», §1.2) — их нет в
// дайджесте Агента 3 (там только subject/predicate/object факты), поэтому
// путь такой: дайджест → детали факта → raw_job_id источника → сырой
// результат Агента 2 (parsing_results.combined_analysis) ИЛИ, если источник —
// прямой веб-поиск Агента 1, а не парсинг Агента 2 (частый случай — см.
// buildTrendContextFromSearchRaw.js), сырой результат Агента 1
// (search_results.result.raw).
//
// Найдено живой проверкой 2026-07-10: раньше это решение принималось
// эвристикой по ключевым словам в свободном тексте (classifyTrendRequest.js,
// теперь удалён) — ненадёжно и непрозрачно для пользователя. Явный вопрос в
// wizard'е убирает угадывание: запрос либо реально обрабатывается с опорой
// на тренды, либо вообще не пытается — третьего не дано.
//
// Ретраи: когда use_trends истинен, Агент 1 (телеграм-бот) в этот же момент
// запускает вживую поиск+анализ по теме wizard-запроса (orchestrate({type:
// 'trends', ...}), см. его telegram-bot/index.js) — это занимает время (сам
// поиск ~30-90с) плюс до одного цикла планировщика Агента 3 (~60с), прежде
// чем свежие данные попадут в дайджест. Одна попытка "в лоб" почти всегда
// упёрлась бы в ещё не готовые данные, поэтому здесь ограниченное число
// повторных попыток с паузой, прежде чем сдаться (best-effort — если
// ничего не появилось, генерация продолжается без обогащения, без ошибки).
//
// LLM-фильтр сопоставления темы (добавлено 2026-07-11, по прямому запросу
// пользователя): до этого безусловно брался ПЕРВЫЙ факт дайджеста — реальное
// сопоставление по теме было помечено как открытая "задача LLM-фильтра
// внутри Агента 4" в «07. Архитектура», §5.2. Теперь `selectFact(topic,
// facts)` (см. selectRelevantFact.js) выбирает факт, реально релевантный
// теме wizard-запроса, либо возвращает null — и тогда обогащения не будет
// вовсе (намеренно НЕ падаем обратно на facts[0]: это и есть тот баг,
// который фильтр исправляет).
import { fetchRawParsingResult, fetchRawSearchResult } from './rawDataReaders.js';
import { buildTrendContextFromSearchRaw } from './buildTrendContextFromSearchRaw.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 20_000;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveTrendContext(db, analysisClient, selectFact, topic) {
  const digest = await analysisClient.getDigest();
  const facts = digest?.facts;
  if (!facts?.length) {
    return null;
  }

  const fact = await selectFact(topic, facts);
  if (!fact) {
    return null;
  }

  const detail = await analysisClient.getDetail(fact.detail_ref);
  const rawJobId = detail?.sources?.[0]?.ref;
  if (!rawJobId) {
    return null;
  }

  const parsed = await fetchRawParsingResult(db, rawJobId);
  if (parsed?.combined_analysis) {
    return parsed.combined_analysis;
  }

  const searchRaw = await fetchRawSearchResult(db, rawJobId);
  return buildTrendContextFromSearchRaw(searchRaw);
}

export function createTrendEnrichment({
  db,
  analysisClient,
  selectFact,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  delayMs = DEFAULT_DELAY_MS,
  sleep = defaultSleep
}) {
  if (!selectFact) {
    throw new Error('createTrendEnrichment: selectFact is required (see selectRelevantFact.js)');
  }

  return async function enrichWithTrends(wizard) {
    if (!wizard.use_trends) {
      return null;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const trendContext = await resolveTrendContext(db, analysisClient, selectFact, wizard.description);
        if (trendContext) {
          return trendContext;
        }
      } catch (err) {
        console.warn(`[enrichWithTrends] attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      }
      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
    return null;
  };
}
