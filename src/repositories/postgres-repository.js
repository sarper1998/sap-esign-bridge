import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export class PostgresRepository {
  constructor({ connectionString }) {
    this.connectionString = connectionString;
    this.pool = null;
  }

  async initialize() {
    const { Pool } = await import('pg');
    this.pool = new Pool({
      connectionString: this.connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    const migration = await readFile(path.join(root, 'db', 'migrations', '001_init.sql'), 'utf8');
    await this.pool.query(migration);
  }

  async ping() {
    await this.pool.query('SELECT 1');
    return true;
  }

  async clear() {
    await this.pool.query('TRUNCATE TABLE signbridge_jobs');
  }

  async save(job) {
    await this.pool.query(
      `INSERT INTO signbridge_jobs (id, sap_event_id, status, document_id, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at`,
      [job.id, job.sap.eventId, job.status, job.document.id, JSON.stringify(job), job.createdAt, job.updatedAt],
    );
    return job;
  }

  async findById(id) {
    const result = await this.pool.query('SELECT payload FROM signbridge_jobs WHERE id = $1', [id]);
    return result.rows[0]?.payload || null;
  }

  async findByEventId(eventId) {
    const result = await this.pool.query('SELECT payload FROM signbridge_jobs WHERE sap_event_id = $1', [eventId]);
    return result.rows[0]?.payload || null;
  }

  async findBySignatureRequestId(requestId) {
    const result = await this.pool.query(
      "SELECT payload FROM signbridge_jobs WHERE payload #>> '{signature,requestId}' = $1 LIMIT 1",
      [requestId],
    );
    return result.rows[0]?.payload || null;
  }

  async list() {
    const result = await this.pool.query('SELECT payload FROM signbridge_jobs ORDER BY created_at DESC LIMIT 250');
    return result.rows.map((row) => row.payload);
  }
}
