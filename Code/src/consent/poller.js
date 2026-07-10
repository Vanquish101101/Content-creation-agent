// src/consent/poller.js
// Надёжный catch-up слой: периодически перечитывает
// intelligence_agent.agent4_consent_queue на случай, если Redis-уведомление
// (быстрый, best-effort слой в subscribe.js) было потеряно. Точное зеркало
// inbox/poller.js.
import { pollAgent1ConsentQueue } from './pollConsentQueue.js';

export function createConsentPoller({ db, onRow }) {
  let intervalHandle = null;

  async function pollOnce() {
    try {
      const rows = await pollAgent1ConsentQueue(db);
      for (const row of rows) {
        await onRow(row);
      }
    } catch (err) {
      console.error('[consent/poller] pollOnce failed:', err.message);
    }
  }

  function start(intervalMs) {
    if (intervalHandle) return;
    intervalHandle = setInterval(() => {
      pollOnce().catch((err) => console.error('[consent/poller] unexpected error in pollOnce:', err.message));
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
