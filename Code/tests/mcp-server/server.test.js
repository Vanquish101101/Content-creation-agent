import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listTools, callTool, createMcpServer } from '../../src/mcp-server/server.js';
import { makeFakeDb } from '../helpers/fakeSupabase.js';

test('listTools returns the three expected tools', async () => {
  const result = await listTools();

  assert.deepEqual(result.tools.map((t) => t.name), ['content_generate', 'content_status', 'content_result']);
});

test('content_generate tool schema requires request', async () => {
  const result = await listTools();
  const tool = result.tools.find((t) => t.name === 'content_generate');

  assert.deepEqual(tool.inputSchema.required, ['request']);
});

test('content_status and content_result tool schemas require job_id', async () => {
  const result = await listTools();

  for (const name of ['content_status', 'content_result']) {
    const tool = result.tools.find((t) => t.name === name);
    assert.deepEqual(tool.inputSchema.required, ['job_id']);
  }
});

test('callTool content_generate awaits generateContent and returns its result as JSON text', async () => {
  const db = makeFakeDb({});
  let receivedRequest = null;
  const generateContent = async (job) => { receivedRequest = job; return { id: 'gc-1', status: 'done', text: 'x' }; };

  const result = await callTool({ db, generateContent }, {
    params: { name: 'content_generate', arguments: { request: { telegram_id: 123, wizard: { content_type: 'text' }, mode: 'content' } } }
  });

  assert.deepEqual(receivedRequest, { telegram_id: 123, wizard: { content_type: 'text' }, mode: 'content' });
  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.id, 'gc-1');
});

test('callTool content_generate returns a descriptive isError when request is missing', async () => {
  const db = makeFakeDb({});
  const generateContent = async () => ({});

  const result = await callTool({ db, generateContent }, { params: { name: 'content_generate', arguments: {} } });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /request is required/);
});

test('callTool content_status returns the status as JSON text', async () => {
  const db = makeFakeDb({
    generated_content: () => ({ data: { id: 'gc-1', status: 'processing', type: 'video', created_at: 'x' }, error: null })
  });

  const result = await callTool({ db, generateContent: async () => {} }, {
    params: { name: 'content_status', arguments: { job_id: 'gc-1' } }
  });

  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.status, 'processing');
});

test('callTool content_status returns a descriptive isError when the job is not found', async () => {
  const db = makeFakeDb({ generated_content: () => ({ data: null, error: { code: 'PGRST116', message: 'not found' } }) });

  const result = await callTool({ db, generateContent: async () => {} }, {
    params: { name: 'content_status', arguments: { job_id: 'gc-missing' } }
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /gc-missing/);
});

test('callTool content_result returns the full row as JSON text', async () => {
  const db = makeFakeDb({
    generated_content: () => ({ data: { id: 'gc-1', status: 'done', r2_url: 'gc-1/img.png' }, error: null })
  });

  const result = await callTool({ db, generateContent: async () => {} }, {
    params: { name: 'content_result', arguments: { job_id: 'gc-1' } }
  });

  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.r2_url, 'gc-1/img.png');
});

test('callTool returns isError for an unknown tool name', async () => {
  const db = makeFakeDb({});

  const result = await callTool({ db, generateContent: async () => {} }, { params: { name: 'not_a_real_tool', arguments: {} } });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Unknown tool/);
});

test('callTool catches a thrown error from generateContent and returns isError', async () => {
  const db = makeFakeDb({});
  const generateContent = async () => { throw new Error('OpenRouter HTTP 500'); };

  const result = await callTool({ db, generateContent }, {
    params: { name: 'content_generate', arguments: { request: { telegram_id: 1, wizard: {}, mode: 'content' } } }
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /OpenRouter HTTP 500/);
});

test('createMcpServer builds a real MCP Server instance', () => {
  const server = createMcpServer({ db: makeFakeDb({}), generateContent: async () => {} });

  assert.ok(server);
});
