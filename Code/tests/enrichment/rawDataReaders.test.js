import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { fetchRawSearchResult, fetchRawParsingResult } from '../../src/enrichment/rawDataReaders.js';

test('fetchRawSearchResult reads intelligence_agent.search_results via .schema() by job_id', async () => {
  const db = makeFakeDb({
    search_results: (state) => {
      assert.equal(state.filters.job_id, 'job-1');
      return { data: { job_id: 'job-1', result: { raw: { perplexity: { summary: 'x' } } } }, error: null };
    }
  });

  const result = await fetchRawSearchResult(db, 'job-1');

  assert.deepEqual(db.schemaCalls, ['intelligence_agent']);
  assert.deepEqual(result, { perplexity: { summary: 'x' } });
});

test('fetchRawSearchResult returns null when not found', async () => {
  const db = makeFakeDb({
    search_results: () => ({ data: null, error: { message: 'not found', code: 'PGRST116' } })
  });

  const result = await fetchRawSearchResult(db, 'missing-job');

  assert.equal(result, null);
});

test('fetchRawParsingResult reads deep_parsing_agent.parsing_results via .schema() by job_id', async () => {
  const db = makeFakeDb({
    parsing_results: (state) => {
      assert.equal(state.filters.job_id, 'job-2');
      return { data: { job_id: 'job-2', result_json: { transcript: 'полный текст' } }, error: null };
    }
  });

  const result = await fetchRawParsingResult(db, 'job-2');

  assert.deepEqual(db.schemaCalls, ['deep_parsing_agent']);
  assert.deepEqual(result, { transcript: 'полный текст' });
});

test('fetchRawParsingResult returns null when not found', async () => {
  const db = makeFakeDb({
    parsing_results: () => ({ data: null, error: { message: 'not found', code: 'PGRST116' } })
  });

  const result = await fetchRawParsingResult(db, 'missing-job');

  assert.equal(result, null);
});
