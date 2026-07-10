import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapContentTypeToPublicationType } from '../../src/publish/mapContentType.js';

test('text maps to publication_type 1 (post)', () => {
  assert.equal(mapContentTypeToPublicationType('text', '11'), 1);
});

test('image maps to publication_type 1 (post)', () => {
  assert.equal(mapContentTypeToPublicationType('image', '11'), 1);
});

test('vertical video (9:16) maps to publication_type 4 (reels/shorts/clips)', () => {
  assert.equal(mapContentTypeToPublicationType('video', '916'), 4);
});

test('non-vertical video maps to publication_type 1 (post)', () => {
  assert.equal(mapContentTypeToPublicationType('video', '11'), 1);
});

test('audio throws — PostMyPost has no audio-post concept', () => {
  assert.throws(() => mapContentTypeToPublicationType('audio', null), /no audio-post concept/);
});
