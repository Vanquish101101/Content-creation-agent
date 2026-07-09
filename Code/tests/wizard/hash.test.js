import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWizardHash } from '../../src/wizard/hash.js';

test('computeWizardHash returns the same hash for the same wizard fields', () => {
  const wizard = {
    network: 'instagram',
    content_type: 'post',
    format: '916',
    style: 'expert',
    description: 'Пост про запуск нового продукта'
  };

  const a = computeWizardHash(wizard);
  const b = computeWizardHash(wizard);

  assert.equal(a, b);
});

test('computeWizardHash returns a different hash when description changes', () => {
  const base = {
    network: 'instagram',
    content_type: 'post',
    format: '916',
    style: 'expert',
    description: 'Пост про запуск нового продукта'
  };

  const changed = { ...base, description: 'Пост про распродажу' };

  assert.notEqual(computeWizardHash(base), computeWizardHash(changed));
});

test('computeWizardHash is independent of key order', () => {
  const a = computeWizardHash({
    network: 'tiktok',
    content_type: 'video',
    format: '916',
    style: 'fun',
    description: 'Reels про тренды'
  });

  const b = computeWizardHash({
    description: 'Reels про тренды',
    style: 'fun',
    format: '916',
    content_type: 'video',
    network: 'tiktok'
  });

  assert.equal(a, b);
});
