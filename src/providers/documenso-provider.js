import crypto from 'node:crypto';
import { assertAllowedDocumentUrl, secureEqual } from '../security.js';

export class DocumensoProvider {
  constructor({ apiUrl, apiKey, allowedHosts }) {
    this.name = 'Documenso';
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.allowedHosts = allowedHosts;
  }

  async createSignatureRequest(job) {
    if (!this.apiKey) throw new Error('DOCUMENSO_API_KEY tanimli degil.');
    assertAllowedDocumentUrl(job.document.url, this.allowedHosts);

    const source = await fetch(job.document.url, { redirect: 'error' });
    if (!source.ok) throw new Error(`SAP belgesi indirilemedi (${source.status}).`);
    const contentType = source.headers.get('content-type') || 'application/pdf';
    if (!contentType.toLowerCase().includes('pdf')) {
      throw new Error('Imzaya gonderilecek belge PDF olmali.');
    }

    const pdfBytes = Buffer.from(await source.arrayBuffer());
    const expectedHash = job.document.hash.replace(/^sha256:/i, '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw new Error('Documenso modunda document.hash tam SHA-256 degeri olmalidir.');
    }
    const actualHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
    if (!secureEqual(actualHash, expectedHash)) {
      throw new Error('SAP belge ozeti indirilen PDF ile eslesmiyor.');
    }

    const form = new FormData();
    form.append('payload', JSON.stringify({
      type: 'DOCUMENT',
      title: job.document.title,
      externalId: job.id,
      recipients: [{
        email: job.signer.email,
        name: job.signer.name,
        role: 'SIGNER',
        fields: [{
          identifier: 0,
          type: 'SIGNATURE',
          page: 1,
          positionX: 62,
          positionY: 82,
          width: 28,
          height: 6,
        }],
      }],
      meta: {
        subject: `Imza bekliyor: ${job.document.title}`,
        message: `SAP onayi tamamlanan ${job.document.id} belgesini guvenli sekilde imzalayin.`,
      },
    }));
    form.append('files', new Blob([pdfBytes], { type: contentType }), `${job.document.id}.pdf`);

    const created = await this.#request('/envelope/create', { method: 'POST', body: form });
    const distributed = await this.#request('/envelope/distribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envelopeId: created.id }),
    });
    const signer = distributed.recipients?.find((recipient) => recipient.email === job.signer.email);

    return {
      provider: 'documenso',
      requestId: created.id,
      signingUrl: signer?.signingUrl || '',
      mode: 'REMOTE_USER_CONSENT',
    };
  }

  async #request(pathname, init) {
    const response = await fetch(`${this.apiUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: this.apiKey,
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Documenso istegi basarisiz (${response.status}): ${body.slice(0, 240)}`);
    }
    return response.json();
  }
}
