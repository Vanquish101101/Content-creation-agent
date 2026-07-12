import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetAccounts } from '../../src/publish/resolveTargetAccounts.js';

function fakeClient({ channels, accounts }) {
  return {
    getChannels: async () => channels,
    getAccounts: async (projectId) => {
      assert.equal(projectId, 245678);
      return accounts;
    }
  };
}

test('resolves accounts whose chanel_id matches the network code and is connected', async () => {
  const client = fakeClient({
    channels: [{ id: 4, code: 'instagram', name: 'Instagram' }, { id: 7, code: 'facebook', name: 'Facebook' }],
    accounts: [
      { id: 33915, chanel_id: 4, name: 'My IG', connection_status: 1 },
      { id: 33916, chanel_id: 7, name: 'My FB', connection_status: 1 }
    ]
  });

  const result = await resolveTargetAccounts(client, 245678, ['instagram']);

  assert.deepEqual(result, [{ network: 'instagram', accounts: [{ id: 33915, chanel_id: 4, name: 'My IG', connection_status: 1 }] }]);
});

test('is case-insensitive when matching the network code', async () => {
  const client = fakeClient({
    channels: [{ id: 4, code: 'instagram', name: 'Instagram' }],
    accounts: [{ id: 33915, chanel_id: 4, name: 'My IG', connection_status: 1 }]
  });

  const result = await resolveTargetAccounts(client, 245678, ['Instagram']);

  assert.equal(result[0].accounts.length, 1);
});

test('excludes accounts that are not connected (connection_status !== 1)', async () => {
  const client = fakeClient({
    channels: [{ id: 4, code: 'instagram', name: 'Instagram' }],
    accounts: [
      { id: 33915, chanel_id: 4, name: 'My IG', connection_status: 1 },
      { id: 33917, chanel_id: 4, name: 'Needs reauth', connection_status: 2 }
    ]
  });

  const result = await resolveTargetAccounts(client, 245678, ['instagram']);

  assert.deepEqual(result[0].accounts.map((a) => a.id), [33915]);
});

test('returns an entry with an empty accounts array when no channel matches the requested network', async () => {
  const client = fakeClient({
    channels: [{ id: 4, code: 'instagram', name: 'Instagram' }],
    accounts: [{ id: 33915, chanel_id: 4, name: 'My IG', connection_status: 1 }]
  });

  const result = await resolveTargetAccounts(client, 245678, ['tiktok']);

  assert.deepEqual(result, [{ network: 'tiktok', accounts: [] }]);
});

test('resolves multiple requested networks in one call, one entry each, calling getChannels/getAccounts only once', async () => {
  let getChannelsCalls = 0;
  let getAccountsCalls = 0;
  const client = {
    getChannels: async () => {
      getChannelsCalls += 1;
      return [{ id: 4, code: 'instagram', name: 'Instagram' }, { id: 6, code: 'telegram', name: 'Telegram' }];
    },
    getAccounts: async () => {
      getAccountsCalls += 1;
      return [
        { id: 1, chanel_id: 4, name: 'IG', connection_status: 1 },
        { id: 2, chanel_id: 6, name: 'TG', connection_status: 1 }
      ];
    }
  };

  const result = await resolveTargetAccounts(client, 245678, ['instagram', 'telegram', 'vk']);

  assert.equal(getChannelsCalls, 1);
  assert.equal(getAccountsCalls, 1);
  assert.deepEqual(result.map((r) => r.network), ['instagram', 'telegram', 'vk']);
  assert.deepEqual(result.map((r) => r.accounts.map((a) => a.id)), [[1], [2], []]);
});
