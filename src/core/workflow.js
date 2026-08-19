import crypto from 'node:crypto';

const FINAL_STATUS = 'SAP_UPDATED';

function iso(date) {
  return date.toISOString();
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} zorunludur.`);
  }
  return value.trim();
}

export class SapESignWorkflow {
  constructor({ provider, sapClient, clock = () => new Date() }) {
    this.provider = provider;
    this.sapClient = sapClient;
    this.clock = clock;
    this.jobs = new Map();
    this.eventIndex = new Map();
    this.demoCounter = 48;
    this.resetDemo();
  }

  resetDemo() {
    this.jobs.clear();
    this.eventIndex.clear();
    const now = this.clock();
    const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60_000);

    const completed = {
      id: 'SB-2026-0046',
      status: FINAL_STATUS,
      sap: { eventId: 'seed-event-46', approvalId: 'APR-700184', system: 'S/4HANA Cloud' },
      document: {
        id: 'SA-45000918',
        title: 'Satin Alma Sozlesmesi — Q3',
        hash: 'sha256:8e4d7b0a…3fc2',
        url: 'demo://SA-45000918.pdf',
      },
      signer: { name: 'Deniz Kaya', email: 'deniz.kaya@example.com', department: 'Satin Alma' },
      signature: {
        provider: 'demo',
        requestId: 'demo_seed_46',
        signingUrl: '',
        mode: 'REMOTE_USER_CONSENT',
        signedAt: iso(minutesAgo(26)),
        signedDocumentUrl: 'demo://signed/SA-45000918.pdf',
      },
      createdAt: iso(minutesAgo(31)),
      updatedAt: iso(minutesAgo(25)),
      events: [
        this.#event('SAP_APPROVAL_RECEIVED', 'SAP onayi dogrulandi', minutesAgo(31)),
        this.#event('SIGNATURE_REQUESTED', 'Guvenli imza talebi olusturuldu', minutesAgo(30)),
        this.#event('SIGNATURE_COMPLETED', 'Imza saglayicisi tamamlandi bilgisini gonderdi', minutesAgo(26)),
        this.#event('DOCUMENT_ARCHIVED', 'Imzali belge ve denetim izi arsivlendi', minutesAgo(25.5)),
        this.#event('SAP_UPDATED', 'SAP belge durumu SIGNED olarak guncellendi', minutesAgo(25)),
      ],
    };

    const waiting = {
      id: 'SB-2026-0047',
      status: 'WAITING_SIGNATURE',
      sap: { eventId: 'seed-event-47', approvalId: 'APR-700185', system: 'S/4HANA Cloud' },
      document: {
        id: 'PO-45000931',
        title: 'Yatirim Harcama Onayi — Hat 04',
        hash: 'sha256:cf71351b…99a1',
        url: 'demo://PO-45000931.pdf',
      },
      signer: { name: 'Selin Aras', email: 'selin.aras@example.com', department: 'Finans' },
      signature: {
        provider: 'demo',
        requestId: 'demo_seed_47',
        signingUrl: '/?sign=SB-2026-0047',
        mode: 'REMOTE_USER_CONSENT',
      },
      createdAt: iso(minutesAgo(7)),
      updatedAt: iso(minutesAgo(6.7)),
      events: [
        this.#event('SAP_APPROVAL_RECEIVED', 'SAP onayi dogrulandi', minutesAgo(7)),
        this.#event('SIGNATURE_REQUESTED', 'Imza talebi hazir; imza sahibinin islemi bekleniyor', minutesAgo(6.7)),
      ],
    };

    for (const job of [completed, waiting]) {
      this.jobs.set(job.id, job);
      this.eventIndex.set(job.sap.eventId, job.id);
    }
  }

  async createFromApproval(input) {
    const payload = this.#validateApproval(input);
    const existingId = this.eventIndex.get(payload.eventId);
    if (existingId) return { job: copy(this.jobs.get(existingId)), duplicate: true };

    const now = this.clock();
    const job = {
      id: this.#nextId(),
      status: 'APPROVED',
      sap: {
        eventId: payload.eventId,
        approvalId: payload.approvalId,
        system: payload.system || 'SAP S/4HANA',
      },
      document: payload.document,
      signer: payload.signer,
      signature: null,
      createdAt: iso(now),
      updatedAt: iso(now),
      events: [this.#event('SAP_APPROVAL_RECEIVED', 'SAP onayi dogrulandi', now)],
    };
    this.jobs.set(job.id, job);
    this.eventIndex.set(payload.eventId, job.id);

    try {
      job.signature = await this.provider.createSignatureRequest(copy(job));
      job.status = 'WAITING_SIGNATURE';
      job.updatedAt = iso(this.clock());
      job.events.push(this.#event(
        'SIGNATURE_REQUESTED',
        `${this.provider.name} uzerinde imza talebi olusturuldu`,
        this.clock(),
      ));
    } catch (error) {
      job.status = 'FAILED';
      job.updatedAt = iso(this.clock());
      job.events.push(this.#event('SIGNATURE_REQUEST_FAILED', error.message, this.clock()));
      throw error;
    }

    return { job: copy(job), duplicate: false };
  }

  async completeSignature(jobId, details = {}) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Imza sureci bulunamadi.');
    if (job.status === FINAL_STATUS) return { job: copy(job), duplicate: true };
    if (job.status !== 'WAITING_SIGNATURE') {
      throw new Error(`Bu surec ${job.status} durumunda tamamlanamaz.`);
    }

    const signedAt = details.signedAt || iso(this.clock());
    job.status = 'SIGNED';
    job.signature.signedAt = signedAt;
    job.signature.signedDocumentUrl = details.signedDocumentUrl || `demo://signed/${job.document.id}.pdf`;
    job.updatedAt = iso(this.clock());
    job.events.push(this.#event('SIGNATURE_COMPLETED', 'E-imza saglayicisi imzayi dogruladi', this.clock()));

    job.status = 'ARCHIVED';
    job.updatedAt = iso(this.clock());
    job.events.push(this.#event('DOCUMENT_ARCHIVED', 'Imzali belge ve denetim izi arsivlendi', this.clock()));

    try {
      job.sap.result = await this.sapClient.markSigned(copy(job));
      job.status = FINAL_STATUS;
      job.updatedAt = iso(this.clock());
      job.events.push(this.#event('SAP_UPDATED', 'SAP belge durumu SIGNED olarak guncellendi', this.clock()));
    } catch (error) {
      job.status = 'SAP_UPDATE_FAILED';
      job.updatedAt = iso(this.clock());
      job.events.push(this.#event('SAP_UPDATE_FAILED', error.message, this.clock()));
      throw error;
    }

    return { job: copy(job), duplicate: false };
  }

  async processDocumensoWebhook(event) {
    if (!event || event.event !== 'DOCUMENT_COMPLETED') {
      return { ignored: true, reason: 'Yalnizca DOCUMENT_COMPLETED islenir.' };
    }
    const envelopeId = event.payload?.envelopeId;
    const externalId = event.payload?.externalId;
    const job = externalId
      ? this.jobs.get(externalId)
      : [...this.jobs.values()].find((candidate) => candidate.signature?.requestId === envelopeId);
    if (!job) return { ignored: true, reason: 'Eslesen SignBridge sureci bulunamadi.' };

    return this.completeSignature(job.id, {
      signedAt: event.payload?.completedAt || event.createdAt || iso(this.clock()),
      signedDocumentUrl: event.payload?.signedDocumentUrl || `documenso://envelope/${envelopeId}`,
    });
  }

  createDemoApproval() {
    const sequence = this.demoCounter + 1;
    return {
      eventId: `sap-demo-${crypto.randomUUID()}`,
      approvalId: `APR-700${sequence}`,
      system: 'SAP S/4HANA Cloud',
      status: 'APPROVED',
      approvedAt: iso(this.clock()),
      document: {
        id: `PR-2026-${String(sequence).padStart(4, '0')}`,
        title: sequence % 2 ? 'Tedarikci Cerceve Sozlesmesi' : 'Butce Revizyon Protokolu',
        hash: `sha256:${crypto.randomBytes(6).toString('hex')}…${crypto.randomBytes(2).toString('hex')}`,
        url: `demo://PR-2026-${String(sequence).padStart(4, '0')}.pdf`,
      },
      signer: {
        name: sequence % 2 ? 'Ece Demir' : 'Mert Aydin',
        email: sequence % 2 ? 'ece.demir@example.com' : 'mert.aydin@example.com',
        department: sequence % 2 ? 'Hukuk' : 'Finans',
      },
    };
  }

  getState() {
    const jobs = [...this.jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(copy);
    const completed = jobs.filter((job) => job.status === FINAL_STATUS).length;
    const waiting = jobs.filter((job) => job.status === 'WAITING_SIGNATURE').length;
    const failures = jobs.filter((job) => job.status.includes('FAILED')).length;
    return {
      provider: this.provider.name,
      metrics: {
        total: jobs.length,
        completed,
        waiting,
        failures,
        successRate: jobs.length ? Math.round((completed / Math.max(1, completed + failures)) * 100) : 100,
      },
      jobs,
    };
  }

  #validateApproval(input) {
    if (!input || typeof input !== 'object') throw new Error('JSON govdesi zorunludur.');
    if (input.status !== 'APPROVED') throw new Error('Yalnizca APPROVED SAP olaylari imza surecini baslatir.');
    return {
      eventId: requireText(input.eventId, 'eventId'),
      approvalId: requireText(input.approvalId, 'approvalId'),
      system: input.system,
      document: {
        id: requireText(input.document?.id, 'document.id'),
        title: requireText(input.document?.title, 'document.title'),
        hash: requireText(input.document?.hash, 'document.hash'),
        url: requireText(input.document?.url, 'document.url'),
      },
      signer: {
        name: requireText(input.signer?.name, 'signer.name'),
        email: requireText(input.signer?.email, 'signer.email'),
        department: input.signer?.department || 'Belirtilmedi',
      },
    };
  }

  #nextId() {
    this.demoCounter += 1;
    return `SB-2026-${String(this.demoCounter).padStart(4, '0')}`;
  }

  #event(type, label, at) {
    return { id: crypto.randomUUID(), type, label, at: iso(at) };
  }
}
