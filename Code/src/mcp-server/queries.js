// src/mcp-server/queries.js
// Слайс 10 — чтение generated_content для content_status/content_result.
// .single()+isNotFoundError — конвенция этого проекта (см. db/errors.js,
// agent1Reader.js), не array-based стиль Агента 3 — своя схема, свой стиль.
import { isNotFoundError } from '../db/errors.js';

export async function getContentStatus(db, jobId) {
  const { data, error } = await db
    .from('generated_content')
    .select('id, status, type, created_at')
    .eq('id', jobId)
    .single();

  if (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw new Error(`getContentStatus: ${error.message}`);
  }
  return data;
}

export async function getContentResult(db, jobId) {
  const { data, error } = await db.from('generated_content').select('*').eq('id', jobId).single();

  if (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw new Error(`getContentResult: ${error.message}`);
  }
  return data;
}
