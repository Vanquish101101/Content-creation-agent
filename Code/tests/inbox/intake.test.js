import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { computeWizardHash } from '../../src/wizard/hash.js';
import { createIntakeHandler } from '../../src/inbox/intake.js';

const WIZARD = {
  network: 'instagram',
  content_type: 'post',
  format: '916',
  style: 'expert',
  description: 'Пост про запуск нового продукта'
};
const WIZARD_HASH = computeWizardHash(WIZARD);

function makeDb({ userRow, alreadyProcessed = false, insertedEvents = [] } = {}) {
  return makeFakeDb({
    users: () => ({ data: userRow, error: null }),
    processed_wizard_requests: (state) => {
      if (state.operation === 'select') {
        return { data: alreadyProcessed ? { id: 'p1' } : null, error: null };
      }
      return { data: null, error: null };
    },
    inbox_events: (state) => {
      insertedEvents.push(state.payload);
      return { data: null, error: null };
    }
  });
}

test('dispatches onJob for a new wizard_ready job (mode: content)', async () => {
  const insertedEvents = [];
  const db = makeDb({
    userRow: { telegram_id: 123, settings: { mode: 'content', wizard: WIZARD, moderation_mode: false } },
    insertedEvents
  });
  let dispatched = null;
  const handler = createIntakeHandler({ db, onJob: (job) => { dispatched = job; } });

  const result = await handler.handleWizardJob({ telegram_id: 123, wizard_hash: WIZARD_HASH, receivedVia: 'redis' });

  assert.equal(result.status, 'dispatched');
  assert.deepEqual(dispatched, {
    telegram_id: 123,
    wizard: WIZARD,
    wizard_hash: WIZARD_HASH,
    mode: 'content',
    moderation_mode: false
  });
  assert.equal(insertedEvents.length, 1);
  assert.equal(insertedEvents[0].status, 'processed');
  assert.equal(insertedEvents[0].source, 'agent1_wizard');
  assert.equal(insertedEvents[0].received_via, 'redis');
});

test('dispatches onJob for mode: publish the same way as mode: content', async () => {
  const db = makeDb({
    userRow: { telegram_id: 123, settings: { mode: 'publish', wizard: WIZARD, moderation_mode: true } }
  });
  let dispatched = null;
  const handler = createIntakeHandler({ db, onJob: (job) => { dispatched = job; } });

  const result = await handler.handleWizardJob({ telegram_id: 123, wizard_hash: WIZARD_HASH, receivedVia: 'poll' });

  assert.equal(result.status, 'dispatched');
  assert.equal(dispatched.mode, 'publish');
  assert.equal(dispatched.moderation_mode, true);
});

test('skips without calling onJob when the wizard was already processed', async () => {
  const insertedEvents = [];
  const db = makeDb({
    userRow: { telegram_id: 123, settings: { mode: 'content', wizard: WIZARD, moderation_mode: false } },
    alreadyProcessed: true,
    insertedEvents
  });
  let called = false;
  const handler = createIntakeHandler({ db, onJob: () => { called = true; } });

  const result = await handler.handleWizardJob({ telegram_id: 123, wizard_hash: WIZARD_HASH, receivedVia: 'redis' });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'already_processed');
  assert.equal(called, false);
  assert.equal(insertedEvents[0].status, 'skipped');
});

test('skips without calling onJob when no wizard settings are found for the user', async () => {
  const db = makeDb({ userRow: null });
  let called = false;
  const handler = createIntakeHandler({ db, onJob: () => { called = true; } });

  const result = await handler.handleWizardJob({ telegram_id: 999, wizard_hash: WIZARD_HASH, receivedVia: 'redis' });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'no_wizard');
  assert.equal(called, false);
});

test('uses the freshly-read wizard hash (not the queue one) when they differ', async () => {
  const changedWizard = { ...WIZARD, description: 'Пост про распродажу' };
  const db = makeDb({
    userRow: { telegram_id: 123, settings: { mode: 'content', wizard: changedWizard, moderation_mode: false } }
  });
  let dispatched = null;
  const handler = createIntakeHandler({ db, onJob: (job) => { dispatched = job; } });

  // wizard_hash из очереди — устаревший (посчитан по старому wizard'у)
  await handler.handleWizardJob({ telegram_id: 123, wizard_hash: WIZARD_HASH, receivedVia: 'redis' });

  assert.equal(dispatched.wizard_hash, computeWizardHash(changedWizard));
});
