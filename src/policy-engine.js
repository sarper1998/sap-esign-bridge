const DEFAULT_POLICIES = [
  {
    id: 'POL-CONTRACT-TR',
    name: 'TR sözleşmeleri',
    documentType: 'CONTRACT',
    companyCode: '1000',
    provider: 'configured',
    signatureLevel: 'QUALIFIED',
    archiveTarget: 'SAP_DMS',
  },
  {
    id: 'POL-PURCHASE-DEFAULT',
    name: 'Satın alma belgeleri',
    documentType: 'PURCHASE',
    companyCode: '*',
    provider: 'configured',
    signatureLevel: 'ADVANCED_OR_QUALIFIED',
    archiveTarget: 'SAP_DMS',
  },
  {
    id: 'POL-DEFAULT',
    name: 'Varsayılan politika',
    documentType: '*',
    companyCode: '*',
    provider: 'configured',
    signatureLevel: 'PROVIDER_POLICY',
    archiveTarget: 'SAP_DMS',
  },
];

export class PolicyEngine {
  constructor(policies = DEFAULT_POLICIES) {
    this.policies = policies;
  }

  evaluate(payload) {
    const type = payload.document?.type || '*';
    const companyCode = payload.companyCode || '*';
    const policy = this.policies.find((candidate) =>
      (candidate.documentType === type || candidate.documentType === '*') &&
      (candidate.companyCode === companyCode || candidate.companyCode === '*'));
    if (!policy) throw new Error('Belge için aktif bir imza politikası bulunamadı.');
    return { ...policy };
  }

  list() {
    return this.policies.map((policy) => ({ ...policy }));
  }
}
