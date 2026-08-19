import crypto from 'node:crypto';
import { MemoryRepository } from '../repositories/memory-repository.js';
import { PolicyEngine } from '../policy-engine.js';

const FINAL_STATUS = 'SAP_UPDATED';
const iso = (date) => date.toISOString();
const copy = (value) => JSON.parse(JSON.stringify(value));

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} zorunludur.`);
  return value.trim();
}

export class SapESignWorkflow {
  constructor({ provider, sapClient, repository = new MemoryRepository(), policyEngine = new PolicyEngine(), clock = () => new Date() }) {
    this.provider = provider;
    this.sapClient = sapClient;
    this.repository = repository;
    this.policyEngine = policyEngine;
    this.clock = clock;
  }

  async initialize({ seedDemo = false } = {}) {
    await this.repository.initialize();
    if (seedDemo && (await this.repository.list()).length === 0) await this.resetDemo();
  }

  async resetDemo() {
    await this.repository.clear();
    const now = this.clock();
    const ago = (minutes) => new Date(now.getTime() - minutes * 60_000);
    const samples = [
      {
        id: 'SB-2026-0046', status: FINAL_STATUS,
        sap: { eventId: 'seed-event-46', approvalId: 'APR-700184', system: 'S/4HANA Cloud', result: { sapStatus: 'SIGNED' } },
        document: { id: 'SA-45000918', title: 'Satın Alma Sözleşmesi — Q3', type: 'CONTRACT', hash: 'sha256:8e4d7b0a…3fc2', url: 'demo://SA-45000918.pdf' },
        signer: { name: 'Deniz Kaya', email: 'deniz.kaya@example.com', department: 'Satın Alma' },
        policy: this.policyEngine.evaluate({ document: { type: 'CONTRACT' }, companyCode: '1000' }),
        signature: { provider: 'demo', requestId: 'demo_seed_46', signingUrl: '', mode: 'REMOTE_USER_CONSENT', signedAt: iso(ago(26)), signedDocumentUrl: 'demo://signed/SA-45000918.pdf' },
        attempts: 1, nextAttemptAt: null, createdAt: iso(ago(31)), updatedAt: iso(ago(25)),
        events: [
          this.#event('SAP_APPROVAL_RECEIVED', 'SAP onayı doğrulandı', ago(31)),
          this.#event('POLICY_MATCHED', 'TR sözleşmeleri politikası eşleşti', ago(30.8)),
          this.#event('SIGNATURE_REQUESTED', 'Güvenli imza talebi oluşturuldu', ago(30)),
          this.#event('SIGNATURE_COMPLETED', 'İmza sağlayıcısı sonucu doğruladı', ago(26)),
          this.#event('DOCUMENT_ARCHIVED', 'İmzalı belge ve denetim izi arşivlendi', ago(25.5)),
          this.#event('SAP_UPDATED', 'SAP belge durumu SIGNED olarak güncellendi', ago(25)),
        ],
      },
      {
        id: 'SB-2026-0047', status: 'WAITING_SIGNATURE',
        sap: { eventId: 'seed-event-47', approvalId: 'APR-700185', system: 'S/4HANA Cloud' },
        document: { id: 'PO-45000931', title: 'Yatırım Harcama Onayı — Hat 04', type: 'PURCHASE', hash: 'sha256:cf71351b…99a1', url: 'demo://PO-45000931.pdf' },
        signer: { name: 'Selin Aras', email: 'selin.aras@example.com', department: 'Finans' },
        policy: this.policyEngine.evaluate({ document: { type: 'PURCHASE' }, companyCode: '1000' }),
        signature: { provider: 'demo', requestId: 'demo_seed_47', signingUrl: '/?sign=SB-2026-0047', mode: 'REMOTE_USER_CONSENT' },
        attempts: 1, nextAttemptAt: null, createdAt: iso(ago(7)), updatedAt: iso(ago(6.7)),
        events: [
          this.#event('SAP_APPROVAL_RECEIVED', 'SAP onayı doğrulandı', ago(7)),
          this.#event('POLICY_MATCHED', 'Satın alma belgeleri politikası eşleşti', ago(6.9)),
          this.#event('SIGNATURE_REQUESTED', 'İmza sahibinin güvenli işlemi bekleniyor', ago(6.7)),
        ],
      },
    ];
    for (const sample of samples) await this.repository.save(sample);
    return this.getState();
  }

  async createFromApproval(input) {
    const payload = this.#validateApproval(input);
    const existing = await this.repository.findByEventId(payload.eventId);
    if (existing) return { job: copy(existing), duplicate: true };
    const now = this.clock();
    const policy = this.policyEngine.evaluate(payload);
    const job = {
      id: this.#nextId(), status: 'APPROVED',
      sap: { eventId: payload.eventId, approvalId: payload.approvalId, system: payload.system || 'SAP S/4HANA' },
      companyCode: payload.companyCode, document: payload.document, signer: payload.signer, policy,
      signature: null, attempts: 0, nextAttemptAt: null,
      createdAt: iso(now), updatedAt: iso(now),
      events: [this.#event('SAP_APPROVAL_RECEIVED', 'SAP onayı doğrulandı', now), this.#event('POLICY_MATCHED', `${policy.name} politikası eşleşti`, now)],
    };
    await this.repository.save(job);
    try {
      job.attempts += 1;
      job.signature = await this.provider.createSignatureRequest(copy(job));
      job.status = 'WAITING_SIGNATURE';
      job.updatedAt = iso(this.clock());
      job.events.push(this.#event('SIGNATURE_REQUESTED', `${this.provider.name} üzerinde imza talebi oluşturuldu`, this.clock()));
      await this.repository.save(job);
    } catch (error) {
      job.status = 'SIGNATURE_REQUEST_FAILED';
      job.nextAttemptAt = iso(new Date(this.clock().getTime() + 5 * 60_000));
      job.updatedAt = iso(this.clock());
      job.events.push(this.#event('SIGNATURE_REQUEST_FAILED', error.message, this.clock()));
      await this.repository.save(job);
      throw error;
    }
    return { job: copy(job), duplicate: false };
  }

  async completeSignature(jobId, details = {}) {
    const job = await this.repository.findById(jobId);
    if (!job) throw new Error('İmza süreci bulunamadı.');
    if (job.status === FINAL_STATUS) return { job: copy(job), duplicate: true };
    if (job.status !== 'WAITING_SIGNATURE') throw new Error(`Bu süreç ${job.status} durumunda tamamlanamaz.`);
    job.status = 'SIGNED';
    job.signature.signedAt = details.signedAt || iso(this.clock());
    job.signature.signedDocumentUrl = details.signedDocumentUrl || `demo://signed/${job.document.id}.pdf`;
    job.updatedAt = iso(this.clock());
    job.events.push(this.#event('SIGNATURE_COMPLETED', 'E-imza sağlayıcısı imzayı doğruladı', this.clock()));
    job.status = 'ARCHIVED';
    job.events.push(this.#event('DOCUMENT_ARCHIVED', 'İmzalı belge ve denetim izi arşivlendi', this.clock()));
    try {
      job.sap.result = await this.sapClient.markSigned(copy(job));
      job.status = FINAL_STATUS;
      job.nextAttemptAt = null;
      job.events.push(this.#event('SAP_UPDATED', 'SAP belge durumu SIGNED olarak güncellendi', this.clock()));
    } catch (error) {
      job.status = 'SAP_UPDATE_FAILED';
      job.nextAttemptAt = iso(new Date(this.clock().getTime() + 5 * 60_000));
      job.events.push(this.#event('SAP_UPDATE_FAILED', error.message, this.clock()));
      await this.repository.save(job);
      throw error;
    }
    job.updatedAt = iso(this.clock());
    await this.repository.save(job);
    return { job: copy(job), duplicate: false };
  }

  async retrySapUpdate(jobId) {
    const job = await this.repository.findById(jobId);
    if (!job || job.status !== 'SAP_UPDATE_FAILED') throw new Error('Yeniden denenebilir SAP aktarımı bulunamadı.');
    job.sap.result = await this.sapClient.markSigned(copy(job));
    job.status = FINAL_STATUS;
    job.attempts += 1;
    job.nextAttemptAt = null;
    job.updatedAt = iso(this.clock());
    job.events.push(this.#event('SAP_UPDATED', 'SAP aktarımı yeniden denemede tamamlandı', this.clock()));
    await this.repository.save(job);
    return { job: copy(job) };
  }

  async processDocumensoWebhook(event) {
    if (!event || event.event !== 'DOCUMENT_COMPLETED') return { ignored: true, reason: 'Yalnızca DOCUMENT_COMPLETED işlenir.' };
    const envelopeId = event.payload?.envelopeId;
    const job = event.payload?.externalId
      ? await this.repository.findById(event.payload.externalId)
      : await this.repository.findBySignatureRequestId(envelopeId);
    if (!job) return { ignored: true, reason: 'Eşleşen SignBridge süreci bulunamadı.' };
    return this.completeSignature(job.id, {
      signedAt: event.payload?.completedAt || event.createdAt || iso(this.clock()),
      signedDocumentUrl: event.payload?.signedDocumentUrl || `documenso://envelope/${envelopeId}`,
    });
  }

  createDemoApproval() {
    const suffix = String(Date.now()).slice(-5);
    return {
      eventId: `sap-demo-${crypto.randomUUID()}`, approvalId: `APR-${suffix}`, system: 'SAP S/4HANA Cloud', companyCode: '1000', status: 'APPROVED', approvedAt: iso(this.clock()),
      document: { id: `PR-2026-${suffix}`, title: 'Tedarikçi Çerçeve Sözleşmesi', type: 'CONTRACT', hash: `sha256:${crypto.randomBytes(6).toString('hex')}…${crypto.randomBytes(2).toString('hex')}`, url: `demo://PR-2026-${suffix}.pdf` },
      signer: { name: 'Ece Demir', email: 'ece.demir@example.com', department: 'Hukuk' },
    };
  }

  async getState() {
    const jobs = await this.repository.list();
    const completed = jobs.filter((job) => job.status === FINAL_STATUS).length;
    const waiting = jobs.filter((job) => job.status === 'WAITING_SIGNATURE').length;
    const failures = jobs.filter((job) => job.status.includes('FAILED')).length;
    return {
      provider: this.provider.name,
      metrics: { total: jobs.length, completed, waiting, failures, successRate: completed + failures ? Math.round((completed / (completed + failures)) * 100) : 100 },
      policies: this.policyEngine.list(), jobs,
    };
  }

  #validateApproval(input) {
    if (!input || typeof input !== 'object') throw new Error('JSON gövdesi zorunludur.');
    if (input.status !== 'APPROVED') throw new Error('Yalnızca APPROVED SAP olayları imza sürecini başlatır.');
    return {
      eventId: requireText(input.eventId, 'eventId'), approvalId: requireText(input.approvalId, 'approvalId'), system: input.system, companyCode: input.companyCode || '*',
      document: { id: requireText(input.document?.id, 'document.id'), title: requireText(input.document?.title, 'document.title'), type: input.document?.type || 'OTHER', hash: requireText(input.document?.hash, 'document.hash'), url: requireText(input.document?.url, 'document.url') },
      signer: { name: requireText(input.signer?.name, 'signer.name'), email: requireText(input.signer?.email, 'signer.email'), department: input.signer?.department || 'Belirtilmedi' },
    };
  }

  #nextId() {
    return `SB-${this.clock().getUTCFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  #event(type, label, at) {
    return { id: crypto.randomUUID(), type, label, at: iso(at) };
  }
}
