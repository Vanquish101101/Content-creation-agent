// src/consent/pollConsentQueue.js
// Надёжный catch-up слой: читает intelligence_agent.agent4_consent_queue
// напрямую, на случай если Redis-уведомление (быстрый слой, subscribe.js)
// было потеряно. Таблица живёт в схеме intelligence_agent (Агент 1,
// отправитель решения) — обязательно .schema(), см. предупреждение в «01.
// Идея.md» про уже дважды случавшийся баг с забытой схемой.
export async function pollAgent1ConsentQueue(db) {
  const { data, error } = await db
    .schema('intelligence_agent')
    .from('agent4_consent_queue')
    .select('*')
    .eq('status', 'pending');

  if (error) {
    throw new Error(`pollAgent1ConsentQueue: ${error.message}`);
  }

  return data ?? [];
}
