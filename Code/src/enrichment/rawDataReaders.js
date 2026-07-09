// src/enrichment/rawDataReaders.js
// Сырые данные Агента 1/2 — fallback, если дайджеста Агента 3 недостаточно
// (нет точной цитаты/полного транскрипта). См. «01. Идея», раздел про доступ
// к сырым данным, и «07. Архитектура», §5.2.
//
// Обе таблицы физически живут в чужих схемах — обязательно .schema(...),
// иначе повторится уже дважды случавшийся в проекте баг (см. «01. Идея»).
import { isNotFoundError } from '../db/errors.js';

export async function fetchRawSearchResult(db, jobId) {
  const { data, error } = await db
    .schema('intelligence_agent')
    .from('search_results')
    .select('*')
    .eq('job_id', jobId)
    .single();

  if (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw new Error(`fetchRawSearchResult: ${error.message}`);
  }
  return data?.result?.raw ?? null;
}

export async function fetchRawParsingResult(db, jobId) {
  const { data, error } = await db
    .schema('deep_parsing_agent')
    .from('parsing_results')
    .select('*')
    .eq('job_id', jobId)
    .single();

  if (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw new Error(`fetchRawParsingResult: ${error.message}`);
  }
  return data?.result_json ?? null;
}
