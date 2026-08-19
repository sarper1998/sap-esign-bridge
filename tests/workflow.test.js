import test from 'node:test';
import assert from 'node:assert/strict';
import { SapESignWorkflow } from '../src/core/workflow.js';
import { createHmac, verifyHmac } from '../src/security.js';

function fixture() {
  return {
    eventId: 'evt-100',
    approvalId: 'APR-100',
    system: 'SAP S/4HANA',
    status: 'APPROVED',
    document: {
      id: 'DOC-100',
      title: 'Test Sozlesmesi',
      hash: 'sha256:abc123',
      url: 'demo://DOC-100.pdf',
    },
    signer: { name: 'Test Kullanici', email: 'test@example.com', department: 'Test' },
  };
}

function workflow() {
  return new SapESignWorkflow({
    provider: {
      name: 'Test Provider',
      async createSignatureRequest(job) {
        return { provider: 'demo', requestId: `sig-${job.id}`, signingUrl: '/sign', mode: 'REMOTE_USER_CONSENT' };
      },
    },
    sapClient: {
      async markSigned(job) { return { sapStatus: 'SIGNED', documentId: job.document.id }; },
    },
  });
}

test('SAP APPROVED olayi imza talebi olusturur', async () => {
  const service = workflow();
  const result = await service.createFromApproval(fixture());
  assert.equal(result.duplicate, false);
  assert.equal(result.job.status, 'WAITING_SIGNATURE');
  assert.equal(result.job.events.at(-1).type, 'SIGNATURE_REQUESTED');
});

test('ayni SAP eventId ikinci kez imza talebi olusturmaz', async () => {
  const service = workflow();
  const first = await service.createFromApproval(fixture());
  const second = await service.createFromApproval(fixture());
  assert.equal(second.duplicate, true);
  assert.equal(second.job.id, first.job.id);
});

test('imza tamamlaninca belge arsivlenir ve SAP guncellenir', async () => {
  const service = workflow();
  const created = await service.createFromApproval(fixture());
  const completed = await service.completeSignature(created.job.id);
  assert.equal(completed.job.status, 'SAP_UPDATED');
  assert.deepEqual(
    completed.job.events.slice(-3).map((event) => event.type),
    ['SIGNATURE_COMPLETED', 'DOCUMENT_ARCHIVED', 'SAP_UPDATED'],
  );
});

test('APPROVED olmayan SAP olayi reddedilir', async () => {
  const service = workflow();
  await assert.rejects(
    () => service.createFromApproval({ ...fixture(), status: 'REJECTED' }),
    /Yalnizca APPROVED/,
  );
});

test('HMAC govde butunlugunu dogrular', () => {
  const body = Buffer.from(JSON.stringify(fixture()));
  const signature = createHmac(body, 'test-secret');
  assert.equal(verifyHmac(body, signature, 'test-secret'), true);
  assert.equal(verifyHmac(Buffer.from('{}'), signature, 'test-secret'), false);
});
