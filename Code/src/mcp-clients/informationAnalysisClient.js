// src/mcp-clients/informationAnalysisClient.js
// Клиент к MCP-серверу Агента 3 (Information analysis agent) — обогащение
// трендовыми данными по требованию (см. «07. Архитектура», §5). Точное
// зеркало паттерна, которым сам Агент 3 обращается к Агенту 2
// (Code/src/mcp-clients/deepParsingClient.js) — тот же
// ClientImpl/TransportImpl seam для тестов, тот же способ разбора ответа
// (JSON внутри content[0].text, MCP-конвенция подтверждена чтением реального
// mcp-server/server.js Агента 3: analysis_digest/analysis_detail/
// analysis_status, порт 7302, путь /mcp).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export function createInformationAnalysisClient({ baseUrl, ClientImpl = Client, TransportImpl = StreamableHTTPClientTransport } = {}) {
  if (!baseUrl) {
    throw new Error('createInformationAnalysisClient: baseUrl is required');
  }

  async function callTool(name, args) {
    const transport = new TransportImpl(new URL(`${baseUrl}/mcp`));
    const client = new ClientImpl(
      { name: 'content-creation-agent', version: '0.1.0' },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);
      const response = await client.callTool({ name, arguments: args });
      const text = response.content?.[0]?.text;
      if (!text) {
        throw new Error(`informationAnalysisClient: empty response from ${name}`);
      }
      return JSON.parse(text);
    } finally {
      await client.close();
    }
  }

  return {
    async getDigest(runId) {
      return callTool('analysis_digest', runId ? { run_id: runId } : {});
    },
    async getDetail(claimId) {
      return callTool('analysis_detail', { claim_id: claimId });
    }
  };
}
