import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { deleteGeneratedContent } from '../../src/quota/deleteContent.js';

function fakeR2() {
  const deleted = [];
  return { deleted, async deleteFile(key) { deleted.push(key); } };
}

test('deletes the R2 object and marks the row as deleted', async () => {
  const r2 = fakeR2();
  const updates = [];
  const db = makeFakeDb({
    generated_content: (state) => {
      if (state.operation === 'select') {
        assert.equal(state.filters.id, 'gc-1');
        return { data: { r2_url: 'gc-1/old-video.mp4' }, error: null };
      }
      updates.push(state.payload);
      return { data: null, error: null };
    }
  });

  await deleteGeneratedContent(db, r2, 'gc-1');

  assert.deepEqual(r2.deleted, ['gc-1/old-video.mp4']);
  assert.equal(updates[0].status, 'deleted');
});

test('skips the R2 delete call when the row has no r2_url (defensive, should not normally happen)', async () => {
  const r2 = fakeR2();
  const db = makeFakeDb({
    generated_content: (state) => {
      if (state.operation === 'select') {
        return { data: { r2_url: null }, error: null };
      }
      return { data: null, error: null };
    }
  });

  await deleteGeneratedContent(db, r2, 'gc-2');

  assert.deepEqual(r2.deleted, []);
});

test('throws when the row lookup fails', async () => {
  const r2 = fakeR2();
  const db = makeFakeDb({
    generated_content: () => ({ data: null, error: { message: 'not found' } })
  });

  await assert.rejects(() => deleteGeneratedContent(db, r2, 'gc-3'), /not found/);
});

// Найдено при добавлении "Карусели" (2026-07-11): запись с несколькими
// файлами хранит их в metadata.files — если удалять только r2_url (первый
// файл), остальные файлы карусели навсегда остаются в R2 мусором.
test('deletes every file in metadata.files when present (carousel — multiple files per record)', async () => {
  const r2 = fakeR2();
  const db = makeFakeDb({
    generated_content: (state) => {
      if (state.operation === 'select') {
        return {
          data: {
            r2_url: 'gc-1/carousel-0.png', // первый файл, для обратной совместимости колонки
            metadata: { files: [{ r2Url: 'gc-1/carousel-0.png' }, { r2Url: 'gc-1/carousel-1.png' }, { r2Url: 'gc-1/carousel-2.png' }] }
          },
          error: null
        };
      }
      return { data: null, error: null };
    }
  });

  await deleteGeneratedContent(db, r2, 'gc-1');

  assert.deepEqual(r2.deleted, ['gc-1/carousel-0.png', 'gc-1/carousel-1.png', 'gc-1/carousel-2.png']);
});

test('falls back to r2_url when metadata.files is absent (records created before Карусель)', async () => {
  const r2 = fakeR2();
  const db = makeFakeDb({
    generated_content: (state) => {
      if (state.operation === 'select') {
        return { data: { r2_url: 'gc-1/old-video.mp4', metadata: { tier: 'cheap' } }, error: null };
      }
      return { data: null, error: null };
    }
  });

  await deleteGeneratedContent(db, r2, 'gc-1');

  assert.deepEqual(r2.deleted, ['gc-1/old-video.mp4']);
});
