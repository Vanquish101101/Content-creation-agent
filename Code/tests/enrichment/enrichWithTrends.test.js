import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { createTrendEnrichment } from '../../src/enrichment/enrichWithTrends.js';

const TREND_WIZARD = { use_trends: true, description: 'Сделай пост про маркетинг' };
const PLAIN_WIZARD = { use_trends: false, description: 'Короткий пост про скидку 20%' };

// Тесты не должны реально ждать — instantSleep не спит, а maxAttempts:1 там,
// где ретраи не проверяются, держит их быстрыми и однозначными.
const instantSleep = async () => {};

// Большинство тестов не проверяют саму логику LLM-фильтра (это отдельно,
// в selectRelevantFact.test.js) — им нужен просто предсказуемый стенд-ин,
// зеркалирующий старое поведение "бери первый факт".
const pickFirstFact = async (topic, facts) => facts[0];

function fakeAnalysisClient(digestsOrDetails) {
  const digests = Array.isArray(digestsOrDetails.digest) ? digestsOrDetails.digest : null;
  const calls = { getDigest: 0, getDetail: [] };
  return {
    calls,
    async getDigest() {
      const i = calls.getDigest;
      calls.getDigest += 1;
      return digests ? digests[Math.min(i, digests.length - 1)] : digestsOrDetails.digest;
    },
    async getDetail(claimId) {
      calls.getDetail.push(claimId);
      return digestsOrDetails.detail;
    }
  };
}

test('throws when selectFact is not provided', () => {
  assert.throws(
    () => createTrendEnrichment({ db: makeFakeDb({}), analysisClient: fakeAnalysisClient({ digest: null }) }),
    /selectFact is required/
  );
});

test('returns null without calling Agent 3 when wizard.use_trends is not true', async () => {
  const analysisClient = fakeAnalysisClient({ digest: null, detail: null });
  const enrich = createTrendEnrichment({ db: makeFakeDb({}), analysisClient, selectFact: pickFirstFact, maxAttempts: 1, sleep: instantSleep });

  const result = await enrich(PLAIN_WIZARD);

  assert.equal(result, null);
  assert.equal(analysisClient.calls.getDigest, 0);
});

test('returns null when the digest has no facts (selectFact never called)', async () => {
  const analysisClient = fakeAnalysisClient({ digest: { facts: [] }, detail: null });
  let selectFactCalled = false;
  const selectFact = async () => { selectFactCalled = true; return null; };
  const enrich = createTrendEnrichment({ db: makeFakeDb({}), analysisClient, selectFact, maxAttempts: 1, sleep: instantSleep });

  const result = await enrich(TREND_WIZARD);

  assert.equal(result, null);
  assert.equal(selectFactCalled, false);
});

// Найдено живой проверкой 2026-07-10, исправлено 2026-07-11: раньше
// facts[0] бралcя безусловно. Теперь selectFact решает — и если ни один
// факт не подходит по теме, обогащения не будет вовсе (не откатываемся на
// facts[0], это и есть тот баг, который фильтр исправляет).
test('returns null when selectFact finds no relevant fact', async () => {
  const analysisClient = fakeAnalysisClient({
    digest: { facts: [{ claim_id: 'c1', detail_ref: 'c1', statement: 'Рецепт борща' }] },
    detail: { sources: [{ source_id: 's1', ref: 'raw-job-1' }] }
  });
  const selectFact = async () => null;
  const enrich = createTrendEnrichment({ db: makeFakeDb({}), analysisClient, selectFact, maxAttempts: 1, sleep: instantSleep });

  const result = await enrich(TREND_WIZARD);

  assert.equal(result, null);
});

test('passes wizard.description and digest.facts to selectFact, uses the fact it returns', async () => {
  const facts = [
    { claim_id: 'c0', detail_ref: 'c0', statement: 'Про крипту' },
    { claim_id: 'c1', detail_ref: 'c1', statement: 'Про маркетинг' }
  ];
  const analysisClient = {
    calls: { getDetail: [] },
    async getDigest() { return { facts }; },
    async getDetail(claimId) { this.calls.getDetail.push(claimId); return { sources: [{ source_id: 's1', ref: 'raw-job-1' }] }; }
  };
  const selectCalls = [];
  const selectFact = async (topic, receivedFacts) => {
    selectCalls.push({ topic, receivedFacts });
    return facts[1]; // сознательно НЕ первый факт — проверяем, что берётся именно то, что вернул selectFact
  };
  const db = makeFakeDb({
    parsing_results: () => ({ data: { job_id: 'raw-job-1', result_json: { combined_analysis: { content_ideas: ['маркетинговая идея'] } } }, error: null })
  });
  const enrich = createTrendEnrichment({ db, analysisClient, selectFact, maxAttempts: 1, sleep: instantSleep });

  const result = await enrich(TREND_WIZARD);

  assert.equal(selectCalls[0].topic, TREND_WIZARD.description);
  assert.deepEqual(selectCalls[0].receivedFacts, facts);
  assert.deepEqual(analysisClient.calls.getDetail, ['c1']); // detail_ref факта, который вернул selectFact, не facts[0]
  assert.deepEqual(result, { content_ideas: ['маркетинговая идея'] });
});

test('returns null when the detail has no sources', async () => {
  const analysisClient = fakeAnalysisClient({
    digest: { facts: [{ claim_id: 'c1', detail_ref: 'c1' }] },
    detail: { sources: [] }
  });
  const enrich = createTrendEnrichment({ db: makeFakeDb({}), analysisClient, selectFact: pickFirstFact, maxAttempts: 1, sleep: instantSleep });

  const result = await enrich(TREND_WIZARD);

  assert.equal(result, null);
});

test('returns combined_analysis from the raw parsing result when trends are requested', async () => {
  const analysisClient = fakeAnalysisClient({
    digest: { facts: [{ claim_id: 'c1', detail_ref: 'c1' }] },
    detail: { sources: [{ source_id: 's1', ref: 'raw-job-1' }] }
  });
  const db = makeFakeDb({
    parsing_results: (state) => {
      assert.equal(state.filters.job_id, 'raw-job-1');
      return {
        data: {
          job_id: 'raw-job-1',
          result_json: {
            combined_analysis: {
              hooks: ['Ты не поверишь...'],
              triggers: ['срочность'],
              offers: ['скидка 20%'],
              viral_reasons: ['неожиданный твист'],
              content_ideas: ['до/после']
            }
          }
        },
        error: null
      };
    }
  });
  const enrich = createTrendEnrichment({ db, analysisClient, selectFact: pickFirstFact, maxAttempts: 1, sleep: instantSleep });

  const result = await enrich(TREND_WIZARD);

  assert.deepEqual(result, {
    hooks: ['Ты не поверишь...'],
    triggers: ['срочность'],
    offers: ['скидка 20%'],
    viral_reasons: ['неожиданный твист'],
    content_ideas: ['до/после']
  });
  assert.deepEqual(analysisClient.calls.getDetail, ['c1']);
});

test('falls back to search_results and returns null when neither source has usable data', async () => {
  const analysisClient = fakeAnalysisClient({
    digest: { facts: [{ claim_id: 'c1', detail_ref: 'c1' }] },
    detail: { sources: [{ source_id: 's1', ref: 'raw-job-1' }] }
  });
  const db = makeFakeDb({
    parsing_results: () => ({ data: { job_id: 'raw-job-1', result_json: {} }, error: null }),
    search_results: () => ({ data: null, error: { message: 'not found', code: 'PGRST116' } })
  });
  const enrich = createTrendEnrichment({ db, analysisClient, selectFact: pickFirstFact, maxAttempts: 1, sleep: instantSleep });

  const result = await enrich(TREND_WIZARD);

  assert.equal(result, null);
});

// Найдено живой проверкой 2026-07-10: этот путь раньше не существовал вообще
// — факт дайджеста, чей источник — веб-поиск Агента 1 (не парсинг Агента 2),
// всегда давал null, хотя реальные данные (например, заголовки видео) были
// доступны.
test('falls back to search_results and builds content_ideas when parsing_results has no combined_analysis', async () => {
  const analysisClient = fakeAnalysisClient({
    digest: { facts: [{ claim_id: 'c1', detail_ref: 'c1' }] },
    detail: { sources: [{ source_id: 's1', ref: 'raw-job-1' }] }
  });
  const db = makeFakeDb({
    parsing_results: () => ({ data: null, error: { message: 'not found', code: 'PGRST116' } }),
    search_results: (state) => {
      assert.equal(state.filters.job_id, 'raw-job-1');
      return {
        data: { job_id: 'raw-job-1', result: { raw: { perplexity: { summary: 'Reels до 3 минут' } } } },
        error: null
      };
    }
  });
  const enrich = createTrendEnrichment({ db, analysisClient, selectFact: pickFirstFact, maxAttempts: 1, sleep: instantSleep });

  const result = await enrich(TREND_WIZARD);

  assert.deepEqual(result, { content_ideas: ['Reels до 3 минут'] });
});

test('does not throw when Agent 3 is unreachable — returns null (enrichment is best-effort)', async () => {
  const analysisClient = {
    async getDigest() { throw new Error('connection refused'); },
    async getDetail() {}
  };
  const enrich = createTrendEnrichment({ db: makeFakeDb({}), analysisClient, selectFact: pickFirstFact, maxAttempts: 1, sleep: instantSleep });

  const result = await enrich(TREND_WIZARD);

  assert.equal(result, null);
});

// --- Ретраи: живой поиск, запущенный Агентом 1 одновременно с хендоффом,
// ещё не успел дойти до дайджеста Агента 3 на первой попытке. ---

test('retries up to maxAttempts, waiting delayMs between, until a real trend context appears', async () => {
  const analysisClient = fakeAnalysisClient({
    digest: [{ facts: [] }, { facts: [] }, { facts: [{ claim_id: 'c1', detail_ref: 'c1' }] }],
    detail: { sources: [{ source_id: 's1', ref: 'raw-job-1' }] }
  });
  const db = makeFakeDb({
    parsing_results: () => ({
      data: { job_id: 'raw-job-1', result_json: { combined_analysis: { content_ideas: ['свежий тренд'] } } },
      error: null
    })
  });
  const sleeps = [];
  const enrich = createTrendEnrichment({
    db,
    analysisClient,
    selectFact: pickFirstFact,
    maxAttempts: 5,
    delayMs: 20000,
    sleep: async (ms) => { sleeps.push(ms); }
  });

  const result = await enrich(TREND_WIZARD);

  assert.deepEqual(result, { content_ideas: ['свежий тренд'] });
  assert.equal(analysisClient.calls.getDigest, 3);
  assert.deepEqual(sleeps, [20000, 20000]);
});

test('gives up and returns null after exhausting all retry attempts', async () => {
  const analysisClient = fakeAnalysisClient({ digest: { facts: [] }, detail: null });
  const sleeps = [];
  const enrich = createTrendEnrichment({
    db: makeFakeDb({}),
    analysisClient,
    selectFact: pickFirstFact,
    maxAttempts: 3,
    delayMs: 1000,
    sleep: async (ms) => { sleeps.push(ms); }
  });

  const result = await enrich(TREND_WIZARD);

  assert.equal(result, null);
  assert.equal(analysisClient.calls.getDigest, 3);
  assert.deepEqual(sleeps, [1000, 1000]);
});

test('a transient failure on one attempt does not abort retries — recovers on a later attempt', async () => {
  let call = 0;
  const analysisClient = {
    calls: { getDetail: [] },
    async getDigest() {
      call += 1;
      if (call === 1) throw new Error('Агент 3 не ответил за 3000мс');
      return { facts: [{ claim_id: 'c1', detail_ref: 'c1' }] };
    },
    async getDetail(claimId) {
      this.calls.getDetail.push(claimId);
      return { sources: [{ source_id: 's1', ref: 'raw-job-1' }] };
    }
  };
  const db = makeFakeDb({
    parsing_results: () => ({
      data: { job_id: 'raw-job-1', result_json: { combined_analysis: { content_ideas: ['ожил после сбоя'] } } },
      error: null
    })
  });
  const enrich = createTrendEnrichment({ db, analysisClient, selectFact: pickFirstFact, maxAttempts: 3, delayMs: 5000, sleep: instantSleep });

  const result = await enrich(TREND_WIZARD);

  assert.deepEqual(result, { content_ideas: ['ожил после сбоя'] });
});
