// src/mcp-server/server.js
// Слайс 10 — MCP-сервер Агента 4 (выход), по образцу Агента 3
// (Information analysis agent/Code/src/mcp-server/server.js), тот же паттерн
// listTools/callTool/createMcpServer.
//
// content_generate — единственное отличие от read-only тулов Агентов 2/3:
// ни один из них не даёт через MCP запускать новую задачу, только читает уже
// готовые данные. Точной сигнатуры "запусти асинхронно, дай job_id, потом
// поллинг" нигде в проекте нет прецедента — вместо изобретения новой очереди
// специально под MCP, content_generate просто ДОЖИДАЕТСЯ результата
// (await generateContent(...)) и возвращает готовый объект целиком. Осознанное
// упрощение: для image/video это может занять десятки секунд, MCP Streamable
// HTTP это выдерживает, но синхронный вызов — не то же самое, что
// "запуск в фоне" из черновика «05. ТЗ», §5.3. content_status/content_result
// при этом всё равно полезны сами по себе — как read-only проверка статуса
// ЛЮБОЙ записи generated_content по id, не только созданной через MCP.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getContentStatus, getContentResult } from './queries.js';

export async function listTools() {
  return {
    tools: [
      {
        name: 'content_generate',
        description: 'Запускает генерацию контента и дожидается результата (текст/фото/видео/аудио, опционально публикация).',
        inputSchema: {
          type: 'object',
          properties: {
            request: {
              type: 'object',
              description: 'Задача в формате { telegram_id, wizard, mode, moderation_mode } — см. src/generation/generate.js.'
            }
          },
          required: ['request']
        }
      },
      {
        name: 'content_status',
        description: 'Текущий статус задачи генерации по её id.',
        inputSchema: {
          type: 'object',
          properties: { job_id: { type: 'string', description: 'id записи в generated_content.' } },
          required: ['job_id']
        }
      },
      {
        name: 'content_result',
        description: 'Ссылки/метаданные готового результата генерации по id.',
        inputSchema: {
          type: 'object',
          properties: { job_id: { type: 'string', description: 'id записи в generated_content.' } },
          required: ['job_id']
        }
      }
    ]
  };
}

export async function callTool({ db, generateContent }, request) {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'content_generate') {
      if (!args?.request) {
        return { content: [{ type: 'text', text: 'content_generate: request is required' }], isError: true };
      }
      const result = await generateContent(args.request);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    if (name === 'content_status') {
      if (!args?.job_id) {
        return { content: [{ type: 'text', text: 'content_status: job_id is required' }], isError: true };
      }
      const status = await getContentStatus(db, args.job_id);
      if (!status) {
        return { content: [{ type: 'text', text: `content_status: job ${args.job_id} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    }

    if (name === 'content_result') {
      if (!args?.job_id) {
        return { content: [{ type: 'text', text: 'content_result: job_id is required' }], isError: true };
      }
      const result = await getContentResult(db, args.job_id);
      if (!result) {
        return { content: [{ type: 'text', text: `content_result: job ${args.job_id} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (error) {
    return { content: [{ type: 'text', text: `Ошибка: ${error.message}` }], isError: true };
  }
}

export function createMcpServer({ db, generateContent }) {
  const server = new Server(
    { name: 'content-creation-agent', version: '0.12.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, listTools);
  server.setRequestHandler(CallToolRequestSchema, (request) => callTool({ db, generateContent }, request));

  return server;
}
