import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { fetchWizardSettings } from '../../src/ingestion/agent1Reader.js';

test('fetchWizardSettings queries intelligence_agent.users via .schema()', async () => {
  const db = makeFakeDb({
    users: (state) => ({
      data: {
        telegram_id: 123,
        settings: {
          mode: 'content',
          wizard: { network: 'instagram', content_type: 'post', format: '916', style: 'expert', description: 'test' },
          moderation_mode: false
        }
      },
      error: null
    })
  });

  await fetchWizardSettings(db, 123);

  assert.deepEqual(db.schemaCalls, ['intelligence_agent']);
});

test('fetchWizardSettings returns the parsed settings object', async () => {
  const db = makeFakeDb({
    users: () => ({
      data: {
        telegram_id: 123,
        settings: {
          mode: 'publish',
          wizard: { network: 'tiktok', content_type: 'video', format: '916', style: 'fun', description: 'реклама' },
          moderation_mode: true
        }
      },
      error: null
    })
  });

  const settings = await fetchWizardSettings(db, 123);

  assert.deepEqual(settings, {
    mode: 'publish',
    wizard: { network: 'tiktok', content_type: 'video', format: '916', style: 'fun', description: 'реклама' },
    moderation_mode: true
  });
});

test('fetchWizardSettings returns null when the user row is not found', async () => {
  const db = makeFakeDb({
    users: () => ({ data: null, error: null })
  });

  const settings = await fetchWizardSettings(db, 999);

  assert.equal(settings, null);
});

test('fetchWizardSettings throws when Supabase returns an error', async () => {
  const db = makeFakeDb({
    users: () => ({ data: null, error: { message: 'connection reset' } })
  });

  await assert.rejects(
    () => fetchWizardSettings(db, 123),
    /connection reset/
  );
});
