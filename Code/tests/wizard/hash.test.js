import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWizardHash } from '../../src/wizard/hash.js';

test('computeWizardHash returns the same hash for the same wizard fields', () => {
  const wizard = {
    project: 'core',
    networks: ['instagram'],
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
    project: 'core',
    networks: ['instagram'],
    content_type: 'post',
    format: '916',
    style: 'expert',
    description: 'Пост про запуск нового продукта'
  };

  const changed = { ...base, description: 'Пост про распродажу' };

  assert.notEqual(computeWizardHash(base), computeWizardHash(changed));
});

test('computeWizardHash returns a different hash when use_trends changes', () => {
  const base = {
    project: 'core',
    networks: ['instagram'],
    content_type: 'post',
    format: '916',
    style: 'expert',
    description: 'Пост про маркетинг',
    use_trends: false
  };

  assert.notEqual(computeWizardHash(base), computeWizardHash({ ...base, use_trends: true }));
});

test('computeWizardHash returns a different hash when project changes', () => {
  const base = {
    project: 'core',
    networks: ['instagram'],
    content_type: 'post',
    format: '916',
    style: 'expert',
    description: 'Пост про маркетинг'
  };

  assert.notEqual(computeWizardHash(base), computeWizardHash({ ...base, project: 'marketing' }));
});

test('computeWizardHash returns a different hash when the set of networks changes', () => {
  const base = {
    project: 'core',
    networks: ['instagram'],
    content_type: 'post',
    format: '916',
    style: 'expert',
    description: 'Пост про маркетинг'
  };

  assert.notEqual(computeWizardHash(base), computeWizardHash({ ...base, networks: ['instagram', 'telegram'] }));
});

test('computeWizardHash is independent of the order networks were selected in', () => {
  const a = computeWizardHash({
    project: 'core',
    networks: ['instagram', 'telegram'],
    content_type: 'video',
    format: '916',
    style: 'fun',
    description: 'Reels про тренды'
  });

  const b = computeWizardHash({
    project: 'core',
    networks: ['telegram', 'instagram'],
    content_type: 'video',
    format: '916',
    style: 'fun',
    description: 'Reels про тренды'
  });

  assert.equal(a, b);
});

test('computeWizardHash is independent of key order', () => {
  const a = computeWizardHash({
    project: 'core',
    networks: ['tiktok'],
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
    networks: ['tiktok'],
    project: 'core'
  });

  assert.equal(a, b);
});
