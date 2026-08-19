import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../src/server.js';

function testConfig() {
  return {
    port: 0,
    baseUrl: 'http://127.0.0.1',
    provider: 'demo',
    sapWebhookSecret: 'test-secret',
    sapUpdateUrl: '',
    sapUpdateToken: '',
    documenso: { apiUrl: 'https://example.invalid/api/v2', apiKey: '', webhookSecret: 'doc-secret' },
    documentHostAllowlist: [],
  };
}

test('HTTP demo akisi uctan uca calisir', async (context) => {
  const { server } = createServer({ config: testConfig() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => server.close());
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.status, 'ok');

  const ready = await fetch(`${baseUrl}/api/ready`).then((response) => response.json());
  assert.equal(ready.status, 'ready');

  const approvalResponse = await fetch(`${baseUrl}/api/demo/approve`, { method: 'POST' });
  assert.equal(approvalResponse.status, 201);
  const approval = await approvalResponse.json();
  assert.equal(approval.job.status, 'WAITING_SIGNATURE');

  const completeResponse = await fetch(`${baseUrl}/api/demo/jobs/${approval.job.id}/complete`, { method: 'POST' });
  const completed = await completeResponse.json();
  assert.equal(completed.job.status, 'SAP_UPDATED');
});
