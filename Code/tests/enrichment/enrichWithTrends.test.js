import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { createTrendEnrichment } from '../../src/enrichment/enrichWithTrends.js';

const TREND_WIZARD = { description: 'Сделай пост в трендовом стиле, что сейчас заходит' };
const PLAIN_WIZARD = { description: 'Короткий пост про скидку 20%' };

function fakeAnalysisClient({ digest, detail }) {
  const calls = { getDigest: 0, getDetail: [] };
  return {
    calls,
    async getDigest() {
      calls.getDigest += 1;
      return digest;
    },
    async getDetail(claimId) {
      calls.getDetail.push(claimId);
      return detail;
    }
  };
}

test('returns null without calling Agent 3 when the wizard does not ask for trends', async () => {
  const analysisClient = fakeAnalysisClient({ digest: null, detail: null });
  const enrich = createTrendEnrichment({ db: makeFakeDb({}), analysisClient });

  const result = await enrich(PLAIN_WIZARD);

  assert.equal(result, null);
  assert.equal(analysisClient.calls.getDigest, 0);
});

test('returns null when the digest has no facts', async () => {
  const analysisClient = fakeAnalysisClient({ digest: { facts: [] }, detail: null });
  const enrich = createTrendEnrichment({ db: makeFakeDb({}), analysisClient });

  const result = await enrich(TREND_WIZARD);

  assert.equal(result, null);
});

test('returns null when the detail has no sources', async () => {
  const analysisClient = fakeAnalysisClient({
    digest: { facts: [{ claim_id: 'c1', detail_ref: 'c1' }] },
    detail: { sources: [] }
  });
  const enrich = createTrendEnrichment({ db: makeFakeDb({}), analysisClient });

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
  const enrich = createTrendEnrichment({ db, analysisClient });

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

test('returns null when the raw parsing result has no combined_analysis', async () => {
  const analysisClient = fakeAnalysisClient({
    digest: { facts: [{ claim_id: 'c1', detail_ref: 'c1' }] },
    detail: { sources: [{ source_id: 's1', ref: 'raw-job-1' }] }
  });
  const db = makeFakeDb({
    parsing_results: () => ({ data: { job_id: 'raw-job-1', result_json: {} }, error: null })
  });
  const enrich = createTrendEnrichment({ db, analysisClient });

  const result = await enrich(TREND_WIZARD);

  assert.equal(result, null);
});

test('does not throw when Agent 3 is unreachable — returns null (enrichment is best-effort)', async () => {
  const analysisClient = {
    async getDigest() { throw new Error('connection refused'); },
    async getDetail() {}
  };
  const enrich = createTrendEnrichment({ db: makeFakeDb({}), analysisClient });

  const result = await enrich(TREND_WIZARD);

  assert.equal(result, null);
});
