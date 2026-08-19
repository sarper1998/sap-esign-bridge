const state = {
  data: null,
  selectedId: null,
  signingId: null,
  busy: false,
};

const elements = {
  simulate: document.querySelector('#simulateButton'),
  reset: document.querySelector('#resetButton'),
  list: document.querySelector('#jobList'),
  detail: document.querySelector('#detailPanel'),
  completed: document.querySelector('#completedMetric'),
  waiting: document.querySelector('#waitingMetric'),
  success: document.querySelector('#successMetric'),
  provider: document.querySelector('#providerMetric'),
  modal: document.querySelector('#signModal'),
  modalClose: document.querySelector('#modalClose'),
  modalDocument: document.querySelector('#modalDocument'),
  modalSigner: document.querySelector('#modalSigner'),
  modalHash: document.querySelector('#modalHash'),
  consent: document.querySelector('#consentCheck'),
  complete: document.querySelector('#completeButton'),
  toast: document.querySelector('#toast'),
};

const statusMap = {
  SAP_UPDATED: { label: 'Tamamlandı', className: 'done' },
  WAITING_SIGNATURE: { label: 'İmza bekliyor', className: 'waiting' },
  APPROVED: { label: 'Onaylandı', className: 'info' },
  SIGNED: { label: 'İmzalandı', className: 'done' },
  ARCHIVED: { label: 'Arşivleniyor', className: 'info' },
  FAILED: { label: 'Hata', className: 'error' },
  SAP_UPDATE_FAILED: { label: 'SAP aktarım hatası', className: 'error' },
};

const eventIcons = {
  SAP_APPROVAL_RECEIVED: 'S',
  SIGNATURE_REQUESTED: '↗',
  SIGNATURE_COMPLETED: '✓',
  DOCUMENT_ARCHIVED: '□',
  SAP_UPDATED: '✓',
  SIGNATURE_REQUEST_FAILED: '!',
  SAP_UPDATE_FAILED: '!',
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 15) return 'şimdi';
  if (seconds < 60) return `${seconds} sn önce`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  return `${Math.floor(minutes / 60)} sa önce`;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'İşlem tamamlanamadı.');
  return payload;
}

function showToast(message, type = 'success') {
  elements.toast.textContent = message;
  elements.toast.className = `toast is-visible ${type}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.className = 'toast';
  }, 3200);
}

function render() {
  if (!state.data) return;
  const { metrics, jobs, provider } = state.data;
  elements.completed.textContent = metrics.completed;
  elements.waiting.textContent = metrics.waiting;
  elements.success.textContent = `${metrics.successRate}%`;
  elements.provider.textContent = provider;

  if (!state.selectedId && jobs.length) state.selectedId = jobs[0].id;
  if (state.selectedId && !jobs.some((job) => job.id === state.selectedId)) state.selectedId = jobs[0]?.id || null;

  elements.list.innerHTML = jobs.map((job) => {
    const status = statusMap[job.status] || { label: job.status, className: 'info' };
    const initials = job.signer.name.split(' ').map((part) => part[0]).slice(0, 2).join('');
    return `
      <button class="job-row ${state.selectedId === job.id ? 'is-selected' : ''}" data-job-id="${escapeHtml(job.id)}" type="button">
        <span class="document-cell">
          <span class="document-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h5"/></svg></span>
          <span><strong>${escapeHtml(job.document.title)}</strong><small>${escapeHtml(job.document.id)} · ${relativeTime(job.createdAt)}</small></span>
        </span>
        <span class="signer-cell"><i>${escapeHtml(initials)}</i><span><strong>${escapeHtml(job.signer.name)}</strong><small>${escapeHtml(job.signer.department)}</small></span></span>
        <span><span class="status-badge ${status.className}"><i></i>${escapeHtml(status.label)}</span></span>
        <span class="row-arrow">→</span>
      </button>`;
  }).join('');

  elements.list.querySelectorAll('[data-job-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedId = button.dataset.jobId;
      render();
    });
  });

  renderDetail(jobs.find((job) => job.id === state.selectedId));
}

function renderDetail(job) {
  if (!job) {
    elements.detail.innerHTML = '<div class="empty-state"><strong>Henüz süreç yok</strong></div>';
    return;
  }
  const status = statusMap[job.status] || { label: job.status, className: 'info' };
  const canSign = job.status === 'WAITING_SIGNATURE' && job.signature?.provider === 'demo';
  elements.detail.innerHTML = `
    <div class="detail-top">
      <div><span class="detail-id">${escapeHtml(job.id)}</span><h3>${escapeHtml(job.document.title)}</h3></div>
      <span class="status-badge ${status.className}"><i></i>${escapeHtml(status.label)}</span>
    </div>
    <div class="detail-meta">
      <div><small>SAP ONAY NO</small><strong>${escapeHtml(job.sap.approvalId)}</strong></div>
      <div><small>BELGE NO</small><strong>${escapeHtml(job.document.id)}</strong></div>
      <div class="wide"><small>SHA‑256 BELGE ÖZETİ</small><code>${escapeHtml(job.document.hash)}</code></div>
    </div>
    <div class="timeline-heading"><strong>Denetim izi</strong><span>${job.events.length} olay</span></div>
    <ol class="timeline">
      ${[...job.events].reverse().map((event, index) => `
        <li class="${index === 0 ? 'latest' : ''}">
          <span class="timeline-icon">${escapeHtml(eventIcons[event.type] || '·')}</span>
          <div><strong>${escapeHtml(event.label)}</strong><small>${relativeTime(event.at)} · ${new Date(event.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</small></div>
        </li>`).join('')}
    </ol>
    ${canSign ? `<button class="sign-now-button" id="signNowButton" type="button"><span>Güvenli imza oturumunu aç</span><span>→</span></button>` : ''}
    <div class="detail-foot"><span><i class="shield-dot">✓</i> Özel anahtar ve PIN bu sisteme girmez</span></div>`;

  document.querySelector('#signNowButton')?.addEventListener('click', () => openSignModal(job.id));
}

function openSignModal(jobId) {
  const job = state.data.jobs.find((item) => item.id === jobId);
  if (!job) return;
  state.signingId = jobId;
  elements.modalDocument.textContent = `${job.document.title} / ${job.document.id}`;
  elements.modalSigner.textContent = `${job.signer.name} · ${job.signer.department}`;
  elements.modalHash.textContent = job.document.hash;
  elements.consent.checked = false;
  elements.complete.disabled = true;
  elements.modal.hidden = false;
  requestAnimationFrame(() => elements.modal.classList.add('is-open'));
}

function closeSignModal() {
  elements.modal.classList.remove('is-open');
  window.setTimeout(() => { elements.modal.hidden = true; }, 180);
  state.signingId = null;
}

async function refresh({ silent = true } = {}) {
  try {
    state.data = await request('/api/state');
    render();
  } catch (error) {
    if (!silent) showToast(error.message, 'error');
  }
}

async function simulateApproval() {
  if (state.busy) return;
  state.busy = true;
  elements.simulate.classList.add('is-loading');
  elements.simulate.querySelector('span').textContent = 'Onay işleniyor…';
  try {
    const result = await request('/api/demo/approve', { method: 'POST', body: '{}' });
    state.selectedId = result.job.id;
    await refresh();
    showToast('SAP onayı doğrulandı; imza talebi otomatik oluşturuldu.');
    document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    state.busy = false;
    elements.simulate.classList.remove('is-loading');
    elements.simulate.querySelector('span').textContent = 'SAP onayını simüle et';
  }
}

async function completeSignature() {
  if (!state.signingId || !elements.consent.checked) return;
  elements.complete.disabled = true;
  elements.complete.querySelector('span').textContent = 'İmza doğrulanıyor…';
  try {
    const jobId = state.signingId;
    await request(`/api/demo/jobs/${encodeURIComponent(jobId)}/complete`, { method: 'POST', body: '{}' });
    closeSignModal();
    state.selectedId = jobId;
    await refresh();
    showToast('İmza doğrulandı, arşivlendi ve SAP kaydı güncellendi.');
  } catch (error) {
    showToast(error.message, 'error');
    elements.complete.disabled = false;
  } finally {
    elements.complete.querySelector('span').textContent = 'Güvenli imzayı tamamla';
  }
}

elements.simulate.addEventListener('click', simulateApproval);
elements.reset.addEventListener('click', async () => {
  try {
    state.data = await request('/api/demo/reset', { method: 'POST', body: '{}' });
    state.selectedId = state.data.jobs[0]?.id || null;
    render();
    showToast('Demo başlangıç durumuna döndü.');
  } catch (error) { showToast(error.message, 'error'); }
});
elements.modalClose.addEventListener('click', closeSignModal);
elements.modal.addEventListener('click', (event) => { if (event.target === elements.modal) closeSignModal(); });
elements.consent.addEventListener('change', () => { elements.complete.disabled = !elements.consent.checked; });
elements.complete.addEventListener('click', completeSignature);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !elements.modal.hidden) closeSignModal(); });

refresh({ silent: false });
window.setInterval(() => { if (elements.modal.hidden) refresh(); }, 5000);

