export function loadConfig(env = process.env) {
  const provider = (env.SIGNATURE_PROVIDER || 'demo').toLowerCase();
  if (!['demo', 'documenso'].includes(provider)) {
    throw new Error(`Desteklenmeyen SIGNATURE_PROVIDER: ${provider}`);
  }

  return {
    port: Number(env.PORT || 8787),
    baseUrl: env.BASE_URL || `http://localhost:${env.PORT || 8787}`,
    gatewayName: env.GATEWAY_NAME || 'SignBridge Production',
    environment: env.DEPLOYMENT_ENV || 'self-hosted',
    databaseUrl: env.DATABASE_URL || '',
    seedDemo: env.SEED_DEMO !== 'false',
    adminToken: env.ADMIN_TOKEN || '',
    provider,
    sapSystemName: env.SAP_SYSTEM_NAME || 'SAP S/4HANA',
    sapWebhookSecret: env.SAP_WEBHOOK_SECRET || 'demo-sap-secret',
    sapUpdateUrl: env.SAP_UPDATE_URL || '',
    sapUpdateToken: env.SAP_UPDATE_TOKEN || '',
    documenso: {
      apiUrl: (env.DOCUMENSO_API_URL || 'https://app.documenso.com/api/v2').replace(/\/$/, ''),
      apiKey: env.DOCUMENSO_API_KEY || '',
      webhookSecret: env.DOCUMENSO_WEBHOOK_SECRET || '',
    },
    documentHostAllowlist: (env.DOCUMENT_HOST_ALLOWLIST || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  };
}
