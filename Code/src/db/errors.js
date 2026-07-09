// src/db/errors.js
// Найдено живой проверкой 2026-07-10: реальный supabase-js/PostgREST .single()
// на пустом результате возвращает НЕ {data:null,error:null}, а ошибку с кодом
// PGRST116 ("Cannot coerce the result to a single JSON object"). Все места,
// где "запись не найдена" — ожидаемый, не аварийный случай, должны проверять
// это явно, а не просто читать data.
const NOT_FOUND_CODE = 'PGRST116';

export function isNotFoundError(error) {
  return error?.code === NOT_FOUND_CODE;
}
