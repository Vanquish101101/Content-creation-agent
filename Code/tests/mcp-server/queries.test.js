import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { getContentStatus, getContentResult } from '../../src/mcp-server/queries.js';

test('getContentStatus returns a status snapshot for an existing job', async () => {
  const db = makeFakeDb({
    generated_content: (state) => {
      assert.equal(state.filters.id, 'gc-1');
      return { data: { id: 'gc-1', status: 'done', type: 'text', created_at: '2026-07-10T10:00:00Z' }, error: null };
    }
  });

  const status = await getContentStatus(db, 'gc-1');

  assert.deepEqual(status, { id: 'gc-1', status: 'done', type: 'text', created_at: '2026-07-10T10:00:00Z' });
});

test('getContentStatus returns null when the job does not exist', async () => {
  const db = makeFakeDb({
    generated_content: () => ({ data: null, error: { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' } })
  });

  assert.equal(await getContentStatus(db, 'gc-missing'), null);
});

test('getContentStatus returns null for a malformed (non-UUID) job_id — Postgres 22P02, found via live MCP call', async () => {
  const db = makeFakeDb({
    generated_content: () => ({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid: "does-not-exist"' } })
  });

  assert.equal(await getContentStatus(db, 'does-not-exist'), null);
});

test('getContentStatus throws on an unexpected database error', async () => {
  const db = makeFakeDb({ generated_content: () => ({ data: null, error: { message: 'connection reset' } }) });

  await assert.rejects(() => getContentStatus(db, 'gc-1'), /connection reset/);
});

test('getContentResult returns the full row (links/metadata) for an existing job', async () => {
  const db = makeFakeDb({
    generated_content: () => ({
      data: {
        id: 'gc-1',
        status: 'done',
        type: 'image',
        r2_url: 'gc-1/img.png',
        cost_usd: 0.02,
        metadata: { tier: 'cheap', model: 'gen4_image_turbo' },
        publish_report: null,
        created_at: '2026-07-10T10:00:00Z'
      },
      error: null
    })
  });

  const result = await getContentResult(db, 'gc-1');

  assert.equal(result.r2_url, 'gc-1/img.png');
  assert.equal(result.cost_usd, 0.02);
});

test('getContentResult returns null when the job does not exist', async () => {
  const db = makeFakeDb({
    generated_content: () => ({ data: null, error: { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' } })
  });

  assert.equal(await getContentResult(db, 'gc-missing'), null);
});

test('getContentResult returns null for a malformed (non-UUID) job_id — Postgres 22P02, found via live MCP call', async () => {
  const db = makeFakeDb({
    generated_content: () => ({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid: "does-not-exist"' } })
  });

  assert.equal(await getContentResult(db, 'does-not-exist'), null);
});
