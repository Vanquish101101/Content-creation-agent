// src/inbox/pollHandoffQueue.js
// Надёжный catch-up слой: читает intelligence_agent.agent4_handoff_queue
// напрямую, на случай если Redis-уведомление (notifications:agent4,
// event: wizard_ready) было потеряно (Агент 4 был недоступен в момент
// публикации — pub/sub без сохранения). См. «07. Архитектура (Бекенд).md», §4.
//
// Таблица живёт в схеме intelligence_agent (Агент 1, отправитель), не в
// content_creation_agent — обязательно .schema(), см. предупреждение в «01.
// Идея.md» про уже дважды случавшийся баг с забытой схемой.
export async function pollAgent1HandoffQueue(db) {
  const { data, error } = await db
    .schema('intelligence_agent')
    .from('agent4_handoff_queue')
    .select('*')
    .eq('status', 'pending');

  if (error) {
    throw new Error(`pollAgent1HandoffQueue: ${error.message}`);
  }

  return data ?? [];
}
