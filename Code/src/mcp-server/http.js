// src/mcp-server/http.js
// Точное зеркало Information analysis agent/Code/src/mcp-server/http.js —
// тот же обход бага Node v24 в @hono/node-server (пустые 202-ответы на
// MCP-уведомления без тела): WebStandardStreamableHTTPServerTransport
// (Request/Response) напрямую, а не Node-обёртка StreamableHTTPServerTransport
// из того же SDK.
import http from 'node:http';
import { Readable } from 'node:stream';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from './server.js';

function toWebRequest(req, port) {
  const url = `http://${req.headers.host ?? `localhost:${port}`}${req.url}`;
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers: new Headers(Object.entries(req.headers).flatMap(([k, v]) => (v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))),
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? 'half' : undefined
  });
}

async function writeWebResponse(webRes, res) {
  res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
  if (!webRes.body) {
    res.end();
    return;
  }
  await new Promise((resolve, reject) => {
    Readable.fromWeb(webRes.body).pipe(res).on('finish', resolve).on('error', reject);
  });
}

export function createMcpHttpServer({ db, generateContent, port }) {
  return http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'content-creation-agent' }));
      return;
    }

    if (req.url === '/mcp') {
      try {
        // Stateless-режим (sessionIdGenerator: undefined) — как и у Агента 3;
        // content_generate не зависит от HTTP-сессии, только от Supabase.
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        transport.onerror = (err) => console.error('[mcp transport error]', err.stack ?? err);
        await createMcpServer({ db, generateContent }).connect(transport);
        const webRes = await transport.handleRequest(toWebRequest(req, port));
        await writeWebResponse(webRes, res);
      } catch (err) {
        console.error('[mcp http] request failed:', err.stack ?? err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
}
