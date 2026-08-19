import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadLocalEnv } from './env.js';
import { loadConfig } from './config.js';
import { createHmac, secureEqual, verifyHmac } from './security.js';
import { DemoSignatureProvider } from './providers/demo-provider.js';
import { DocumensoProvider } from './providers/documenso-provider.js';
import { SapClient } from './sap-client.js';
import { SapESignWorkflow } from './core/workflow.js';
import { MemoryRepository } from './repositories/memory-repository.js';
import { PostgresRepository } from './repositories/postgres-repository.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function rawBody(request, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('Istek govdesi cok buyuk.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveFile(response, fileName, contentType) {
  const body = await readFile(path.join(root, 'public', fileName));
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': fileName === 'index.html' ? 'no-store' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  response.end(body);
}

export function buildRuntime(overrides = {}) {
  const config = overrides.config || loadConfig();
  const provider = overrides.provider || (config.provider === 'documenso'
    ? new DocumensoProvider({
        ...config.documenso,
        allowedHosts: config.documentHostAllowlist,
      })
    : new DemoSignatureProvider({ baseUrl: config.baseUrl }));
  const sapClient = overrides.sapClient || new SapClient({
    updateUrl: config.sapUpdateUrl,
    token: config.sapUpdateToken,
  });
  const repository = overrides.repository || (config.databaseUrl
    ? new PostgresRepository({ connectionString: config.databaseUrl })
    : new MemoryRepository());
  const workflow = overrides.workflow || new SapESignWorkflow({ provider, sapClient, repository });
  const ready = workflow.initialize({ seedDemo: config.seedDemo });
  return { config, provider, sapClient, repository, workflow, ready };
}

export function createServer(overrides = {}) {
  const runtime = buildRuntime(overrides);
  const { config, workflow } = runtime;

  const server = createHttpServer(async (request, response) => {
    const requestUrl = new URL(request.url, config.baseUrl);
    const route = requestUrl.pathname;

    try {
      await runtime.ready;
      if (request.method === 'GET' && route === '/') return serveFile(response, 'index.html', 'text/html; charset=utf-8');
      if (request.method === 'GET' && route === '/styles.css') return serveFile(response, 'styles.css', 'text/css; charset=utf-8');
      if (request.method === 'GET' && route === '/app.js') return serveFile(response, 'app.js', 'text/javascript; charset=utf-8');

      if (request.method === 'GET' && route === '/api/health') {
        return json(response, 200, {
          status: 'ok',
          service: 'signbridge-gateway',
          version: '1.1.0',
          environment: config.environment,
          provider: config.provider,
          time: new Date().toISOString(),
        });
      }
      if (request.method === 'GET' && route === '/api/ready') {
        await runtime.repository.ping();
        return json(response, 200, { status: 'ready', database: config.databaseUrl ? 'postgresql' : 'memory' });
      }
      if (request.method === 'GET' && route === '/api/runtime') {
        return json(response, 200, {
          gatewayName: config.gatewayName,
          environment: config.environment,
          database: config.databaseUrl ? 'PostgreSQL' : 'Memory / demo',
          sapSystem: config.sapSystemName,
          provider: runtime.provider.name,
          connections: [
            { id: 'sap', name: config.sapSystemName, type: 'SAP', status: 'connected' },
            { id: 'signature', name: runtime.provider.name, type: 'E-İmza', status: 'connected' },
          ],
        });
      }
      if (request.method === 'GET' && route === '/api/state') {
        return json(response, 200, await workflow.getState());
      }
      if (request.method === 'POST' && route === '/api/demo/reset') {
        if (!config.seedDemo) return json(response, 403, { error: 'Demo uçları bu kurulumda kapalıdır.' });
        await workflow.resetDemo();
        return json(response, 200, await workflow.getState());
      }
      if (request.method === 'POST' && route === '/api/demo/approve') {
        const payload = workflow.createDemoApproval();
        const result = await workflow.createFromApproval(payload);
        return json(response, 201, result);
      }

      const completeMatch = route.match(/^\/api\/demo\/jobs\/([^/]+)\/complete$/);
      if (request.method === 'POST' && completeMatch) {
        if (config.provider !== 'demo') return json(response, 403, { error: 'Bu endpoint yalnizca demo modunda aciktir.' });
        const result = await workflow.completeSignature(decodeURIComponent(completeMatch[1]));
        return json(response, 200, result);
      }

      const retryMatch = route.match(/^\/api\/jobs\/([^/]+)\/retry-sap$/);
      if (request.method === 'POST' && retryMatch) {
        if (config.adminToken && !secureEqual(request.headers.authorization, `Bearer ${config.adminToken}`)) {
          return json(response, 401, { error: 'Yönetici yetkilendirmesi gerekli.' });
        }
        const result = await workflow.retrySapUpdate(decodeURIComponent(retryMatch[1]));
        return json(response, 200, result);
      }

      if (request.method === 'POST' && route === '/api/webhooks/sap/approval') {
        const raw = await rawBody(request);
        if (!verifyHmac(raw, request.headers['x-sap-signature'], config.sapWebhookSecret)) {
          return json(response, 401, { error: 'Webhook dogrulanamadi.' });
        }
        const payload = JSON.parse(raw.toString('utf8'));
        const result = await workflow.createFromApproval(payload);
        return json(response, result.duplicate ? 200 : 202, result);
      }

      if (request.method === 'POST' && route === '/api/webhooks/documenso') {
        const raw = await rawBody(request);
        if (!config.documenso.webhookSecret ||
            !secureEqual(request.headers['x-documenso-secret'], config.documenso.webhookSecret)) {
          return json(response, 401, { error: 'Webhook dogrulanamadi.' });
        }
        const result = await workflow.processDocumensoWebhook(JSON.parse(raw.toString('utf8')));
        return json(response, 200, result);
      }

      if (request.method === 'POST' && route === '/api/demo/sign-sap-payload') {
        const raw = await rawBody(request);
        return json(response, 200, { signature: createHmac(raw, config.sapWebhookSecret) });
      }

      return json(response, 404, { error: 'Endpoint bulunamadi.' });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : 422;
      return json(response, status, { error: error.message || 'Beklenmeyen hata.' });
    }
  });

  return { server, runtime };
}

loadLocalEnv(path.join(root, '.env'));

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const { server, runtime } = createServer();
  runtime.ready.then(() => {
    server.listen(runtime.config.port, '0.0.0.0', () => {
      console.log(`SignBridge Gateway çalışıyor: ${runtime.config.baseUrl}`);
      console.log(`İmza sağlayıcısı: ${runtime.provider.name}`);
      console.log(`Veri deposu: ${runtime.config.databaseUrl ? 'PostgreSQL' : 'Memory / demo'}`);
    });
  }).catch((error) => {
    console.error(`SignBridge başlatılamadı: ${error.message}`);
    process.exitCode = 1;
  });
}
