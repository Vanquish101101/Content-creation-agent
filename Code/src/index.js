// src/index.js
import 'dotenv/config';
import { createSupabaseClient } from './db/client.js';
import { createIntakeHandler } from './inbox/intake.js';
import { subscribeToInbox } from './inbox/subscribe.js';
import { createHandoffPoller } from './inbox/poller.js';
import { createGenerationOrchestrator } from './generation/generate.js';
import { createR2Client } from './storage/r2Client.js';

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

  // R2 — опционален на этом этапе: ни одна реализованная пока генерация
  // (только text, Слайс 2) не сохраняет файлы. Настраивается заранее, чтобы
  // Слайсы 4-6 (фото/видео/аудио) могли подключить его через routeDeps без
  // изменений в index.js — если переменные не заданы, r2 остаётся null и
  // текстовая генерация продолжает работать как прежде.
  const r2EnvVars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const r2Configured = r2EnvVars.every((name) => process.env[name]);
  const r2 = r2Configured
    ? createR2Client({
        accountId: process.env.R2_ACCOUNT_ID,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucket: process.env.R2_BUCKET
      })
    : null;
  if (!r2Configured) {
    console.warn('[index] R2 not configured — image/video/audio slices (4-6) will fail to store files once implemented; text generation is unaffected');
  }

  // deps namespaced по типу контента — text (OpenRouter) и image (Runway)
  // используют РАЗНЫЕ ключи, общий плоский объект deps их бы перепутал (см.
  // regression-тест `route.test.js`, "does not leak deps.text.apiKey...").
  // RUNWAY_API_KEY опционален, как и R2 — без него image-задачи будут падать
  // в createImageCascade с понятной ошибкой "apiKey is required", оркестратор
  // помечает такую запись как error, не роняя процесс; text продолжает
  // работать. video/audio (Слайсы 5-6) пока не реализованы вообще —
  // routeByContentType бросает "not implemented yet".
  const orchestrator = createGenerationOrchestrator({
    db,
    routeDeps: {
      text: {
        apiKey: requireEnv('OPENROUTER_API_KEY'),
        heliconeApiKey: process.env.HELICONE_API_KEY || undefined
      },
      image: {
        apiKey: process.env.RUNWAY_API_KEY || undefined,
        r2
      }
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
