// src/index.js
import 'dotenv/config';
import { createSupabaseClient } from './db/client.js';
import { createIntakeHandler } from './inbox/intake.js';
import { subscribeToInbox } from './inbox/subscribe.js';
import { createHandoffPoller } from './inbox/poller.js';
import { createGenerationOrchestrator } from './generation/generate.js';
import { createStorageClient } from './storage/createStorageClient.js';
import { createInformationAnalysisClient } from './mcp-clients/informationAnalysisClient.js';
import { createTrendEnrichment } from './enrichment/enrichWithTrends.js';
import { createAgent1Notifier } from './delivery/agent1Notifier.js';
import { createPostMyPostClient } from './publish/postMyPostClient.js';
import { createContentPublisher } from './publish/publishContent.js';
import { createMcpHttpServer } from './mcp-server/http.js';
import { subscribeToConsent } from './consent/subscribe.js';
import { createConsentPoller } from './consent/poller.js';
import { createDecisionHandler } from './consent/handleDecision.js';

const DEFAULT_MCP_HTTP_PORT = 7303;

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

  // Обратный канал Агент 4 → Агент 1 (см. src/delivery/agent1Notifier.js) — первый
  // реальный потребитель: предупреждение о квоте R2 (message_type quota_warning,
  // src/quota/*), передан в orchestrator ниже. Слайс 8 (модерация) и Слайс 9 (отчёт)
  // добавят свои message_type через тот же notifyAgent1.
  const notifyAgent1 = createAgent1Notifier({ db, redisUrl: requireEnv('REDIS_URL') });

  // Хранилище — опционально: text (Слайс 2) не сохраняет файлы и не нуждается в нём.
  // image/video/audio (Слайсы 4-6) все требуют хранилище для загрузки результата —
  // без переменных окружения r2 остаётся null, эти задачи будут падать в
  // своём каскаде с понятной ошибкой, text продолжает работать как прежде.
  // STORAGE_PROVIDER выбирает backend (см. src/storage/createStorageClient.js);
  // по умолчанию/пока единственно реализованный — 'r2'.
  const r2EnvVars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const r2Configured = r2EnvVars.every((name) => process.env[name]);
  const r2 = r2Configured
    ? createStorageClient({
        provider: process.env.STORAGE_PROVIDER || 'r2',
        accountId: process.env.R2_ACCOUNT_ID,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucket: process.env.R2_BUCKET
      })
    : null;
  if (!r2Configured) {
    console.warn('[index] Storage not configured — image/video/audio generation will fail to store files; text generation is unaffected');
  }

  // deps namespaced по типу контента — text/image/video/audio используют
  // РАЗНЫЕ ключи, общий плоский объект deps их бы перепутал (см.
  // regression-тест `route.test.js`, "does not leak deps.text.apiKey...").
  // Все, кроме OPENROUTER_API_KEY (Слайс 2, всегда нужен для текста),
  // опциональны, как и R2 — без них соответствующие задачи будут падать в
  // своём каскаде с понятной ошибкой "... is required", оркестратор
  // помечает такую запись как error, не роняя процесс; text продолжает
  // работать. Все 4 типа контента из MVP-скопа (Слайсы 2, 4-6) теперь
  // реализованы.
  // Обогащение трендами (Слайс 7) — опционально: без INFORMATION_ANALYSIS_AGENT_URL
  // enrich не передаётся вовсе, generateContent просто ставит trendContext: null
  // (см. generate.js) — обычная генерация без обогащения, ничего не падает.
  const enrich = process.env.INFORMATION_ANALYSIS_AGENT_URL
    ? createTrendEnrichment({
        db,
        analysisClient: createInformationAnalysisClient({ baseUrl: process.env.INFORMATION_ANALYSIS_AGENT_URL })
      })
    : undefined;
  if (!enrich) {
    console.warn('[index] INFORMATION_ANALYSIS_AGENT_URL not configured — trend enrichment (Слайс 7) disabled, generation proceeds without it');
  }

  // Публикация (Слайс 8) — опциональна: без POSTMYPOST_API_KEY/POSTMYPOST_PROJECT_ID
  // publish не передаётся вовсе, mode:'publish' завершится понятным
  // publish_failed ("PostMyPost not configured"), остальная генерация не страдает.
  const publish = process.env.POSTMYPOST_API_KEY && process.env.POSTMYPOST_PROJECT_ID
    ? createContentPublisher({
        client: createPostMyPostClient({ apiKey: process.env.POSTMYPOST_API_KEY }),
        r2,
        projectId: process.env.POSTMYPOST_PROJECT_ID
      })
    : undefined;
  if (!publish) {
    console.warn('[index] POSTMYPOST_API_KEY/POSTMYPOST_PROJECT_ID not configured — mode:"publish" jobs will be marked publish_failed');
  }

  const orchestrator = createGenerationOrchestrator({
    db,
    enrich,
    notifyAgent1,
    publish,
    r2,
    routeDeps: {
      text: {
        apiKey: requireEnv('OPENROUTER_API_KEY'),
        heliconeApiKey: process.env.HELICONE_API_KEY || undefined
      },
      image: {
        apiKey: process.env.RUNWAY_API_KEY || undefined,
        r2
      },
      video: {
        apiKey: process.env.MINIMAX_API_KEY || undefined,
        r2
      },
      audio: {
        deepgramApiKey: process.env.DEEPGRAM_API_KEY || undefined,
        elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || undefined,
        elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || undefined,
        r2
      }
    }
  });

  // Канал согласия пользователя (пункт G, «Доработки для Агентов 1 и 3») —
  // приёмная сторона квоты/модерации: Агент 1 присылает решение
  // (одобрено/отклонено) по каналу notifications:agent4_from_agent1 +
  // intelligence_agent.agent4_consent_queue (симметрично уже существующему
  // приёму wizard_ready/digest_ready выше). Готово к работе, как только
  // появится отправляющая сторона у Агента 1 (сейчас не реализована).
  const handleDecision = createDecisionHandler({ db, r2, publish, notifyAgent1 });

  await subscribeToConsent({
    redisUrl: requireEnv('REDIS_URL'),
    onDecision: (event) =>
      handleDecision({
        generatedContentId: event.generatedContentId,
        decisionType: event.decisionType,
        decision: event.decision
      }).catch((err) => console.error('[index] handleDecision (redis) failed:', err.message))
  });

  const consentPoller = createConsentPoller({
    db,
    onRow: (row) =>
      handleDecision({
        generatedContentId: row.generated_content_id,
        decisionType: row.decision_type,
        decision: row.decision
      }).catch((err) => console.error('[index] handleDecision (poll) failed:', err.message))
  });
  consentPoller.start(POLL_INTERVAL_MS);

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
      // Обогащение трендами (Слайс 7) — не реактивное: не запускается по
      // этому событию, а вызывается по требованию внутри generateContent
      // (см. enrichWithTrends.js), когда wizard явно просит опору на тренды.
      // Событие только логируется — держим подписку живой на случай будущего
      // расширения (например, предзагрузка/кэш последнего run_id).
      console.log(`[index] digest_ready received for run_id=${event.run_id} (informational only — enrichment is pull-based, see Слайс 7)`);
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

  // MCP-сервер (Слайс 10) — выходной интерфейс Агента 4, по аналогии с
  // Агентами 2/3. Не единственный вход в генерацию (основной путь — Redis/
  // поллинг выше через intake), но content_generate тоже проходит через тот
  // же orchestrator.generateContent, так что дедуп/квота/публикация/отчёт
  // работают одинаково независимо от того, откуда пришёл запрос.
  const mcpPort = Number(process.env.MCP_HTTP_PORT) || DEFAULT_MCP_HTTP_PORT;
  const mcpServer = createMcpHttpServer({ db, generateContent: orchestrator.generateContent, port: mcpPort });
  mcpServer.listen(mcpPort, () => {
    console.log(`Content Creation Agent: MCP-сервер слушает на порту ${mcpPort} (/mcp, /health)`);
  });

  console.log(`Content Creation Agent: listening on notifications:agent4, polling intelligence_agent.agent4_handoff_queue every ${POLL_INTERVAL_MS}ms`);
})();
