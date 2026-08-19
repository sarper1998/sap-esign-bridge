export class SapClient {
  constructor({ updateUrl, token }) {
    this.updateUrl = updateUrl;
    this.token = token;
  }

  async markSigned(job) {
    if (!this.updateUrl) {
      return { mode: 'demo', sapStatus: 'SIGNED', reference: `SAP-${job.document.id}` };
    }

    const response = await fetch(this.updateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({
        approvalId: job.sap.approvalId,
        documentId: job.document.id,
        signatureRequestId: job.signature.requestId,
        signedDocumentUrl: job.signature.signedDocumentUrl,
        status: 'SIGNED',
        signedAt: job.signature.signedAt,
      }),
    });

    if (!response.ok) throw new Error(`SAP geri bildirimi basarisiz (${response.status}).`);
    return response.headers.get('content-type')?.includes('json')
      ? response.json()
      : { sapStatus: 'SIGNED' };
  }
}
