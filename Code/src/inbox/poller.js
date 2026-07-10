// src/inbox/poller.js
// Надёжный catch-up слой: периодически перечитывает
// intelligence_agent.agent4_handoff_queue на случай, если Redis-уведомление
// (быстрый, best-effort слой в subscribe.js) было потеряно. См. «07.
// Архитектура (Бекенд).md», §4.2.
import { pollAgent1HandoffQueue, markHandoffRowDone } from './pollHandoffQueue.js';

export function createHandoffPoller({ db, onRow }) {
  let intervalHandle = null;

  async function pollOnce() {
    try {
      const rows = await pollAgent1HandoffQueue(db);
      for (const row of rows) {
        await onRow(row);
        await markHandoffRowDone(db, row.id);
      }
    } catch (err) {
      console.error('[poller] pollOnce failed:', err.message);
    }
  }

  function start(intervalMs) {
    if (intervalHandle) return;
    intervalHandle = setInterval(() => {
      pollOnce().catch((err) => console.error('[poller] unexpected error in pollOnce:', err.message));
    }, intervalMs);
  }

  function stop() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  return { pollOnce, start, stop };
}
