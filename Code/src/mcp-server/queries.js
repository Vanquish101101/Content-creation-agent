// src/mcp-server/queries.js
// Слайс 10 — чтение generated_content для content_status/content_result.
// .single()+isNotFoundError — конвенция этого проекта (см. db/errors.js,
// agent1Reader.js), не array-based стиль Агента 3 — своя схема, свой стиль.
//
// Найдено живой проверкой 2026-07-10 (реальный MCP-клиент, реальный
// контейнер): job_id, не являющийся валидным UUID (например, опечатка),
// падает не в isNotFoundError (PGRST116 — валидный UUID, просто нет строки),
// а в отдельную ошибку Postgres при попытке привести строку к типу uuid —
// код '22P02' ("invalid input syntax for type uuid"). С точки зрения
// вызывающего MCP-тула оба случая означают одно и то же: "такой задачи нет" —
// оба трактуются как not-found, а не как аварийная ошибка сервера.
import { isNotFoundError } from '../db/errors.js';

const INVALID_UUID_CODE = '22P02';

function isNotFoundOrInvalidId(error) {
  return isNotFoundError(error) || error?.code === INVALID_UUID_CODE;
}

export async function getContentStatus(db, jobId) {
  const { data, error } = await db
    .from('generated_content')
    .select('id, status, type, created_at')
    .eq('id', jobId)
    .single();

  if (error) {
    if (isNotFoundOrInvalidId(error)) {
      return null;
    }
    throw new Error(`getContentStatus: ${error.message}`);
  }
  return data;
}

export async function getContentResult(db, jobId) {
  const { data, error } = await db.from('generated_content').select('*').eq('id', jobId).single();

  if (error) {
    if (isNotFoundOrInvalidId(error)) {
      return null;
    }
    throw new Error(`getContentResult: ${error.message}`);
  }
  return data;
}
