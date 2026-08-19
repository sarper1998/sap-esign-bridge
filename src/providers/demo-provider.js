import crypto from 'node:crypto';

export class DemoSignatureProvider {
  constructor({ baseUrl }) {
    this.name = 'Guvenli Imza Demo';
    this.baseUrl = baseUrl;
  }

  async createSignatureRequest(job) {
    return {
      provider: 'demo',
      requestId: `demo_${crypto.randomUUID()}`,
      signingUrl: `${this.baseUrl}/?sign=${encodeURIComponent(job.id)}`,
      mode: 'REMOTE_USER_CONSENT',
    };
  }
}
