function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class MemoryRepository {
  constructor() {
    this.jobs = new Map();
  }

  async initialize() {}

  async ping() {
    return true;
  }

  async clear() {
    this.jobs.clear();
  }

  async save(job) {
    this.jobs.set(job.id, clone(job));
    return clone(job);
  }

  async findById(id) {
    const job = this.jobs.get(id);
    return job ? clone(job) : null;
  }

  async findByEventId(eventId) {
    const job = [...this.jobs.values()].find((candidate) => candidate.sap.eventId === eventId);
    return job ? clone(job) : null;
  }

  async findBySignatureRequestId(requestId) {
    const job = [...this.jobs.values()].find((candidate) => candidate.signature?.requestId === requestId);
    return job ? clone(job) : null;
  }

  async list() {
    return [...this.jobs.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }
}
