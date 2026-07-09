import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInformationAnalysisClient } from '../../src/mcp-clients/informationAnalysisClient.js';

function fakeClientClasses(responsePayload, { callToolThrows = null } = {}) {
  const calls = { connect: [], callTool: [], close: 0 };

  class FakeTransport {
    constructor(url) {
      calls.transportUrl = url;
    }
  }

  class FakeClient {
    constructor(info, options) {
      calls.clientInfo = info;
      calls.clientOptions = options;
    }
    async connect(transport) {
      calls.connect.push(transport);
    }
    async callTool(args) {
      calls.callTool.push(args);
      if (callToolThrows) throw callToolThrows;
      return { content: [{ type: 'text', text: JSON.stringify(responsePayload) }] };
    }
    async close() {
      calls.close += 1;
    }
  }

  return { ClientImpl: FakeClient, TransportImpl: FakeTransport, calls };
}

test('throws when baseUrl is missing', () => {
  assert.throws(() => createInformationAnalysisClient({}), /baseUrl is required/);
});

test('getDigest connects to baseUrl + /mcp and calls analysis_digest with no run_id by default', async () => {
  const { ClientImpl, TransportImpl, calls } = fakeClientClasses({ digest_id: 'd1', facts: [], contradictions: [], meta: {} });
  const client = createInformationAnalysisClient({ baseUrl: 'http://information-analysis-agent:7302', ClientImpl, TransportImpl });

  await client.getDigest();

  assert.equal(calls.transportUrl.toString(), 'http://information-analysis-agent:7302/mcp');
  assert.deepEqual(calls.callTool[0], { name: 'analysis_digest', arguments: {} });
  assert.equal(calls.close, 1);
});

test('getDigest passes run_id when given', async () => {
  const { ClientImpl, TransportImpl, calls } = fakeClientClasses({ digest_id: 'd1', facts: [], contradictions: [], meta: {} });
  const client = createInformationAnalysisClient({ baseUrl: 'http://information-analysis-agent:7302', ClientImpl, TransportImpl });

  await client.getDigest('run-42');

  assert.deepEqual(calls.callTool[0], { name: 'analysis_digest', arguments: { run_id: 'run-42' } });
});

test('getDigest returns the parsed digest', async () => {
  const payload = {
    digest_id: 'd1',
    facts: [{ claim_id: 'c1', statement: 'X', confidence: { level: 'высокая' }, detail_ref: 'c1' }],
    contradictions: [],
    meta: { items_processed: 5 }
  };
  const { ClientImpl, TransportImpl } = fakeClientClasses(payload);
  const client = createInformationAnalysisClient({ baseUrl: 'http://information-analysis-agent:7302', ClientImpl, TransportImpl });

  const digest = await client.getDigest();

  assert.deepEqual(digest, payload);
});

test('getDetail calls analysis_detail with claim_id', async () => {
  const { ClientImpl, TransportImpl, calls } = fakeClientClasses({
    claim_id: 'c1',
    statement: 'X',
    sources: [{ source_id: 's1', type: 'video', ref: 'job-1', excerpt: null, confidence: 'высокая' }],
    reasoning: 'r',
    history: []
  });
  const client = createInformationAnalysisClient({ baseUrl: 'http://information-analysis-agent:7302', ClientImpl, TransportImpl });

  const detail = await client.getDetail('c1');

  assert.deepEqual(calls.callTool[0], { name: 'analysis_detail', arguments: { claim_id: 'c1' } });
  assert.equal(detail.sources[0].ref, 'job-1');
});

test('throws a descriptive error when the tool call rejects', async () => {
  const { ClientImpl, TransportImpl } = fakeClientClasses(null, { callToolThrows: new Error('connection refused') });
  const client = createInformationAnalysisClient({ baseUrl: 'http://information-analysis-agent:7302', ClientImpl, TransportImpl });

  await assert.rejects(() => client.getDigest(), /connection refused/);
});

test('throws a descriptive error when the response has no text content', async () => {
  class FakeTransport { constructor() {} }
  class FakeClient {
    async connect() {}
    async callTool() { return { content: [] }; }
    async close() {}
  }
  const client = createInformationAnalysisClient({ baseUrl: 'http://information-analysis-agent:7302', ClientImpl: FakeClient, TransportImpl: FakeTransport });

  await assert.rejects(() => client.getDigest(), /empty response/);
});

test('closes the client even when connect() itself throws', async () => {
  const calls = { close: 0 };
  class FakeTransport { constructor() {} }
  class FakeClient {
    async connect() { throw new Error('connection refused'); }
    async callTool() { throw new Error('should not be called'); }
    async close() { calls.close += 1; }
  }
  const client = createInformationAnalysisClient({ baseUrl: 'http://information-analysis-agent:7302', ClientImpl: FakeClient, TransportImpl: FakeTransport });

  await assert.rejects(() => client.getDigest(), /connection refused/);
  assert.equal(calls.close, 1);
});
