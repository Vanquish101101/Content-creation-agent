// src/index.js
import 'dotenv/config';
import { createSupabaseClient } from './db/client.js';
import { createIntakeHandler } from './inbox/intake.js';
import { subscribeToInbox } from './inbox/subscribe.js';
import { createHandoffPoller } from './inbox/poller.js';
import { createGenerationOrchestrator } from './generation/generate.js';

const POLL_INTERVAL_MS = 30_000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`index.js: missing required environment variable ${name}`);
  }
  return value;
}

(async () => {
  const db = createSupabaseClient({
    url: requireEnv('SUPABASE_URL'),
    serviceKey: requireEnv('SUPABASE_SERVICE_KEY')
  });

  // Слайс 2: только content_type === 'text' реально генерирует — image/video/
  // audio (Слайсы 4-6) пока падают в routeByContentType с понятной ошибкой
  // "not implemented yet", оркестратор корректно помечает такую запись как
  // error (не роняет процесс).
  const orchestrator = createGenerationOrchestrator({
    db,
    routeDeps: {
      apiKey: requireEnv('OPENROUTER_API_KEY'),
      heliconeApiKey: process.env.HELICONE_API_KEY || undefined
    }
  });

  const intake = createIntakeHandler({
    db,
    onJob: (job) =>
      orchestrator
        .generateContent(job)
        .catch((err) => console.error(`[index] generateContent failed for telegram_id=${job.telegram_id}:`, err.message))
  });

  await subscribeToInbox({
    redisUrl: requireEnv('REDIS_URL'),
    onWizardReady: (event) => {
      intake
        .handleWizardJob({ telegram_id: event.telegram_id, wizard_hash: event.wizard_hash, receivedVia: 'redis' })
        .catch((err) => console.error('[index] handleWizardJob (redis) failed:', err.message));
    },
    onDigestReady: (event) => {
      // Опциональное обогащение трендами (см. «07. Архитектура», §5) — не
      // реализовано (Слайс 7), событие пока просто логируется.
      console.log(`[index] digest_ready received for run_id=${event.run_id} — trend enrichment not implemented yet (Слайс 7)`);
    }
  });

  const poller = createHandoffPoller({
    db,
    onRow: (row) =>
      intake
        .handleWizardJob({ telegram_id: row.telegram_id, wizard_hash: row.wizard_hash, receivedVia: 'poll' })
        .catch((err) => console.error('[index] handleWizardJob (poll) failed:', err.message))
  });
  poller.start(POLL_INTERVAL_MS);

  console.log(`Content Creation Agent: listening on notifications:agent4, polling intelligence_agent.agent4_handoff_queue every ${POLL_INTERVAL_MS}ms`);
})();
