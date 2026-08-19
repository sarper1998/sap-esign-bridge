# Security Policy

## Supported version

Security fixes target the latest `main` branch.

## Reporting

Do not open public issues for suspected vulnerabilities. Contact the repository owner privately through the GitHub profile and include affected version, reproduction steps and impact.

## Deployment baseline

- Terminate TLS at a managed reverse proxy/WAF.
- Keep port 8787 private.
- Store credentials in a secret manager; never commit `.env`.
- Set `SEED_DEMO=false` in production.
- Restrict document hosts with `DOCUMENT_HOST_ALLOWLIST`.
- Rotate SAP, admin and provider secrets.
- Back up and encrypt PostgreSQL.
- Forward application/audit logs to the central SIEM.

SignBridge must never receive or store the signer's private key or PIN. Provider and legal suitability remain the deployer's responsibility.
