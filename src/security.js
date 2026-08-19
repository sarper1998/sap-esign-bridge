import crypto from 'node:crypto';

export function secureEqual(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string') return false;
  const left = Buffer.from(received, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createHmac(rawBody, secret) {
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

export function verifyHmac(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  return secureEqual(signature, createHmac(rawBody, secret));
}

export function assertAllowedDocumentUrl(documentUrl, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(documentUrl);
  } catch {
    throw new Error('Belge URL adresi gecersiz.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Uretimde belge URL adresi HTTPS kullanmalidir.');
  }
  if (!allowedHosts.length) {
    throw new Error('DOCUMENT_HOST_ALLOWLIST yapilandirilmadan uzak belge indirilemez.');
  }
  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error('Belge sunucusu izin listesinde degil.');
  }
  return parsed;
}
