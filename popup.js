// ─────────────────────────────────────────────
//  Tally — Popup Script
// ─────────────────────────────────────────────

let allApplications = [];
let allPending = [];

// ── Init ──────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupTabs();
  setupSearch();
  setupButtons();
});

// ── Data Loading ──────────────────────────────

async function loadData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_ALL_DATA' }, (response) => {
      if (!response) { resolve(); return; }
      allApplications = response.applications || [];
      allPending = response.pending || [];
      renderStats();
      renderApplications(allApplications);
      renderPending(allPending);
      updatePendingUI();
      resolve();
    });
  });
}

// ── Stats ─────────────────────────────────────

function renderStats() {
  const today = new Date().toDateString();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const todayCount = allApplications.filter(a => new Date(a.date).toDateString() === today).length;
  const weekCount = allApplications.filter(a => new Date(a.date).getTime() > weekAgo).length;

  document.getElementById('stat-today').textContent = todayCount;
  document.getElementById('stat-week').textContent = weekCount;
  document.getElementById('stat-total').textContent = allApplications.length;
}

// ── Applications List ─────────────────────────

function renderApplications(apps) {
  const list = document.getElementById('applications-list');
  const empty = document.getElementById('empty-state');

  if (apps.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = apps.map(app => applicationHTML(app)).join('');

  // Attach delete listeners
  list.querySelectorAll('.app-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteApplication(btn.dataset.id);
    });
  });
}

function applicationHTML(app) {
  const dateStr = formatDate(app.date);
  const sourceClass = getSourceClass(app.source);
  const typeTag = app.type === 'auto'
    ? `<span class="app-type-tag tag-auto">AUTO</span>`
    : `<span class="app-type-tag tag-manual">MANUAL</span>`;

  return `
    <div class="app-item" data-id="${app.id}">
      <div class="app-source-dot ${sourceClass}"></div>
      <div class="app-body">
        <div class="app-company">${escapeHtml(app.company)}</div>
        <div class="app-role">${escapeHtml(app.role)}</div>
        <div class="app-meta">
          <span class="app-date">${dateStr}</span>
          ${typeTag}
          <span class="app-date" style="color:#555">${escapeHtml(app.source || '')}</span>
        </div>
      </div>
      <button class="app-delete" data-id="${app.id}" title="Delete">✕</button>
    </div>
  `;
}

function getSourceClass(source) {
  if (!source) return 'dot-unknown';
  const s = source.toLowerCase();
  if (s.includes('linkedin')) return 'dot-linkedin';
  if (s.includes('indeed')) return 'dot-indeed';
  if (s.includes('handshake')) return 'dot-handshake';
  return 'dot-external';
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Pending List ──────────────────────────────

function renderPending(pending) {
  const list = document.getElementById('pending-list');
  const empty = document.getElementById('pending-empty');

  if (pending.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = pending.map(p => pendingHTML(p)).join('');

  list.querySelectorAll('.btn-confirm').forEach(btn => {
    btn.addEventListener('click', () => resolvePending(btn.dataset.id, true));
  });
  list.querySelectorAll('.btn-dismiss').forEach(btn => {
    btn.addEventListener('click', () => resolvePending(btn.dataset.id, false));
  });
}

function pendingHTML(p) {
  const timeAgo = getTimeAgo(p.pendingAt);
  return `
    <div class="pending-item" data-pending-id="${p.pendingId}">
      <div class="pending-item-header">
        <div>
          <div class="pending-co">${escapeHtml(p.company || 'Unknown')}</div>
          <div class="pending-role">${escapeHtml(p.role || 'Unknown role')}</div>
        </div>
        <div class="pending-time">${timeAgo}</div>
      </div>
      <div class="pending-btns">
        <button class="btn-confirm" data-id="${p.pendingId}">✓ Yes, Applied</button>
        <button class="btn-dismiss" data-id="${p.pendingId}">✕ Dismiss</button>
      </div>
    </div>
  `;
}

function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function updatePendingUI() {
  const count = allPending.length;
  const banner = document.getElementById('pending-banner');
  const badge = document.getElementById('pending-badge');
  const countText = document.getElementById('pending-count-text');

  if (count > 0) {
    banner.classList.remove('hidden');
    badge.classList.remove('hidden');
    badge.textContent = count;
    countText.textContent = `${count} unconfirmed application${count > 1 ? 's' : ''}`;
  } else {
    banner.classList.add('hidden');
    badge.classList.add('hidden');
  }
}

// ── Actions ───────────────────────────────────

async function deleteApplication(id) {
  chrome.runtime.sendMessage({ type: 'DELETE_APPLICATION', id }, () => {
    allApplications = allApplications.filter(a => a.id !== id);
    renderStats();
    const currentSearch = document.getElementById('search-input').value;
    const filtered = filterApps(allApplications, currentSearch);
    renderApplications(filtered);
  });
}

async function resolvePending(pendingId, confirmed) {
  chrome.runtime.sendMessage({ type: 'RESOLVE_PENDING', pendingId, confirmed }, () => {
    allPending = allPending.filter(p => p.pendingId !== pendingId);
    renderPending(allPending);
    updatePendingUI();
    if (confirmed) {
      // Reload to show the newly confirmed application
      loadData();
    }
  });
}

// ── Search ────────────────────────────────────

function setupSearch() {
  const input = document.getElementById('search-input');
  input.addEventListener('input', () => {
    const filtered = filterApps(allApplications, input.value);
    renderApplications(filtered);
  });
}

function filterApps(apps, query) {
  if (!query.trim()) return apps;
  const q = query.toLowerCase();
  return apps.filter(a =>
    a.company?.toLowerCase().includes(q) ||
    a.role?.toLowerCase().includes(q) ||
    a.source?.toLowerCase().includes(q)
  );
}

// ── Tabs ──────────────────────────────────────

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });

  // Pending banner "Review" button goes to pending tab
  document.getElementById('btn-view-pending').addEventListener('click', () => {
    document.querySelector('[data-tab="pending"]').click();
  });
}

// ── Buttons ───────────────────────────────────

function setupButtons() {
  // Export CSV
  document.getElementById('btn-export').addEventListener('click', exportCSV);

  // Clear all
  document.getElementById('btn-clear').addEventListener('click', () => {
    showConfirm(
      'Clear all data?',
      'This will permanently delete all tracked applications and pending items.',
      () => {
        chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, () => {
          allApplications = [];
          allPending = [];
          renderStats();
          renderApplications([]);
          renderPending([]);
          updatePendingUI();
        });
      }
    );
  });
}

// ── Export CSV ────────────────────────────────

function exportCSV() {
  if (allApplications.length === 0) {
    alert('No applications to export.');
    return;
  }

  const headers = ['Company', 'Role', 'Date', 'Source', 'Type', 'URL'];
  const rows = allApplications.map(a => [
    csvEscape(a.company),
    csvEscape(a.role),
    new Date(a.date).toLocaleDateString(),
    csvEscape(a.source),
    a.type,
    csvEscape(a.url)
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `tally-applications-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ── Confirm Dialog ────────────────────────────

function showConfirm(title, message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="confirm-dialog-btns">
        <button id="confirm-yes-btn">Delete</button>
        <button id="confirm-no-btn">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('confirm-yes-btn').onclick = () => {
    overlay.remove();
    onConfirm();
  };
  document.getElementById('confirm-no-btn').onclick = () => overlay.remove();
}

// ── Utils ─────────────────────────────────────

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
