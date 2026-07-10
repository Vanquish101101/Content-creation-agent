import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContentReport } from '../../src/delivery/buildContentReport.js';

test('builds a short report from wizard + result for text content', () => {
  const wizard = { network: 'instagram', content_type: 'text', description: 'Пост про скидку 20%' };
  const result = { text: 'Готовый пост!', costUsd: 0.001 };

  const report = buildContentReport({ wizard, result });

  assert.equal(report.network, 'instagram');
  assert.equal(report.contentType, 'text');
  assert.equal(report.description, 'Пост про скидку 20%');
  assert.equal(report.text, 'Готовый пост!');
  assert.equal(report.sizeBytes, null);
});

test('includes sizeBytes for image/video/audio content', () => {
  const wizard = { network: 'instagram', content_type: 'video', description: 'Ролик' };
  const result = { r2Url: 'gc-1/video.mp4', sizeBytes: 654321, costUsd: 0.2 };

  const report = buildContentReport({ wizard, result });

  assert.equal(report.sizeBytes, 654321);
  assert.equal(report.text, null);
});

test('truncates a long description to a short preview', () => {
  const longDescription = 'x'.repeat(300);
  const wizard = { network: 'instagram', content_type: 'text', description: longDescription };
  const result = { text: 'y' };

  const report = buildContentReport({ wizard, result });

  assert.equal(report.description.length, 201); // 200 chars + ellipsis
  assert.ok(report.description.endsWith('…'));
});

test('does not truncate a short description', () => {
  const wizard = { network: 'instagram', content_type: 'text', description: 'короткое' };
  const result = { text: 'y' };

  const report = buildContentReport({ wizard, result });

  assert.equal(report.description, 'короткое');
});

test('includes publishReport when provided', () => {
  const wizard = { network: 'instagram', content_type: 'text', description: 'x' };
  const result = { text: 'y' };
  const publishReport = [{ network: 'instagram', accountId: 1, status: 'success' }];

  const report = buildContentReport({ wizard, result, publishReport });

  assert.deepEqual(report.publishReport, publishReport);
});

test('omits publishReport key entirely when not provided (mode content)', () => {
  const wizard = { network: 'instagram', content_type: 'text', description: 'x' };
  const result = { text: 'y' };

  const report = buildContentReport({ wizard, result });

  assert.equal('publishReport' in report, false);
});
