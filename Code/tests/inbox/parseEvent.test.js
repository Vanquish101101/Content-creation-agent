import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInboxEvent } from '../../src/inbox/parseEvent.js';

test('parses a wizard_ready message from Agent 1', () => {
  const raw = JSON.stringify({
    event: 'wizard_ready',
    telegram_id: 123456789,
    wizard_hash: 'abc123',
    mode: 'content',
    timestamp: '2026-07-10T10:00:00.000Z'
  });

  const parsed = parseInboxEvent(raw);

  assert.deepEqual(parsed, {
    type: 'wizard_ready',
    telegram_id: 123456789,
    wizard_hash: 'abc123',
    mode: 'content',
    timestamp: '2026-07-10T10:00:00.000Z'
  });
});

test('parses a digest_ready message from Agent 3', () => {
  const raw = JSON.stringify({
    event: 'digest_ready',
    run_id: 'a1b2c3',
    timestamp: '2026-07-10T10:05:00.000Z'
  });

  const parsed = parseInboxEvent(raw);

  assert.deepEqual(parsed, {
    type: 'digest_ready',
    run_id: 'a1b2c3',
    timestamp: '2026-07-10T10:05:00.000Z'
  });
});

test('returns null for malformed JSON instead of throwing', () => {
  assert.equal(parseInboxEvent('{not json'), null);
});

test('returns null for an unrecognized event type', () => {
  const raw = JSON.stringify({ event: 'something_else', foo: 'bar' });

  assert.equal(parseInboxEvent(raw), null);
});

test('returns null when wizard_ready is missing required fields', () => {
  const raw = JSON.stringify({ event: 'wizard_ready', telegram_id: 123 });

  assert.equal(parseInboxEvent(raw), null);
});
