// ─────────────────────────────────────────────
//  Tally — Shared Content Script Utilities
// ─────────────────────────────────────────────

window.Tally = window.Tally || {};

// ── Colour tokens (light theme) ──────────────
const C = {
  bg:      '#ffffff',
  surface: '#f8f9fb',
  border:  '#e2e5ea',
  accent:  '#0a8c5e',
  accentBg:'#e6f7f2',
  orange:  '#c9501a',
  orangeBg:'#fff0ea',
  text:    '#1a1d23',
  muted:   '#6b7280',
  shadow:  'rgba(0,0,0,0.12)',
};

// ── Toast Notification (stays until closed) ──

Tally.showToast = function(jobData, todayCount) {
  const existing = document.getElementById('tally-toast');
  if (existing) existing.remove();

  const countLabel = todayCount
    ? `<div class="tally-toast-count">🗂 ${todayCount} applied today</div>`
    : '';

  const toast = document.createElement('div');
  toast.id = 'tally-toast';
  toast.innerHTML = `
    <div class="tally-toast-inner">
      <div class="tally-toast-left">
        <div class="tally-toast-icon">🎯</div>
      </div>
      <div class="tally-toast-body">
        <div class="tally-toast-title">Application Logged!</div>
        <div class="tally-toast-sub">${escapeHtml(jobData.company)} · ${escapeHtml(jobData.role)}</div>
        ${countLabel}
      </div>
      <button class="tally-toast-close" id="tally-close-btn">✕</button>
    </div>
  `;

  injectStyles(`
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap');
    #tally-toast {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 2147483647;
      font-family: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
      animation: tally-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    @keyframes tally-in {
      from { transform: translateX(110%) scale(0.95); opacity: 0; }
      to   { transform: translateX(0)   scale(1);    opacity: 1; }
    }
    @keyframes tally-out {
      to { transform: translateX(110%) scale(0.95); opacity: 0; }
    }
    .tally-toast-inner {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: #ffffff;
      border: 1.5px solid #0a8c5e;
      border-radius: 14px;
      padding: 16px 14px 16px 16px;
      min-width: 300px;
      max-width: 340px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12), 0 0 0 4px #e6f7f2;
    }
    .tally-toast-left {
      background: #e6f7f2;
      border-radius: 10px;
      width: 38px; height: 38px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; font-size: 1.1rem;
    }
    .tally-toast-body { flex: 1; padding-top: 1px; }
    .tally-toast-title {
      font-size: 0.85rem; font-weight: 700; color: #0a8c5e;
    }
    .tally-toast-sub {
      font-size: 0.78rem; color: #1a1d23; margin-top: 3px; font-weight: 600;
    }
    .tally-toast-count {
      font-size: 0.72rem; color: #6b7280; margin-top: 5px;
    }
    .tally-toast-close {
      background: #f8f9fb;
      border: 1px solid #e2e5ea;
      border-radius: 6px;
      color: #6b7280;
      cursor: pointer;
      font-size: 0.7rem;
      padding: 4px 7px;
      flex-shrink: 0;
      transition: all 0.15s;
      margin-top: 1px;
    }
    .tally-toast-close:hover {
      background: #fee2e2; border-color: #fca5a5; color: #dc2626;
    }
  `, 'tally-toast-styles');

  document.body.appendChild(toast);

  // Close button only — NO auto-timeout, stays until user dismisses
  document.getElementById('tally-close-btn').onclick = () => {
    toast.style.animation = 'tally-out 0.25s ease forwards';
    setTimeout(() => toast.remove(), 250);
  };
};

// ── External Confirmation Overlay ─────────────

Tally.showExternalConfirm = function(jobData, onConfirm, onDeny) {
  const existing = document.getElementById('tally-confirm');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'tally-confirm';
  overlay.innerHTML = `
    <div class="tally-card">
      <div class="tally-card-header">
        <div class="tally-logo">Wing<span class="tally-logo-accent">man</span></div>
        <span class="tally-tag">🔗 External Site</span>
      </div>
      <div class="tally-company-block">
        <div class="tally-company-name">${escapeHtml(jobData.company || 'This company')}</div>
        <div class="tally-company-role">${escapeHtml(jobData.role || 'Unknown role')}</div>
      </div>
      <div class="tally-question">Did you submit your application?</div>
      <div class="tally-btns">
        <button id="tally-yes-btn">✓ Yes, Applied</button>
        <button id="tally-no-btn">✕ Not yet</button>
      </div>
      <div class="tally-footer">Via ${escapeHtml(jobData.source || 'job board')}</div>
    </div>
  `;

  injectStyles(`
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap');
    #tally-confirm {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
      animation: tally-popin 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    @keyframes tally-popin {
      from { transform: scale(0.88) translateY(-8px); opacity: 0; }
      to   { transform: scale(1)    translateY(0);    opacity: 1; }
    }
    .tally-card {
      background: #ffffff;
      border: 1.5px solid #e2e5ea;
      border-radius: 16px;
      padding: 20px;
      width: 300px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.12);
    }
    .tally-card-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
    }
    .tally-logo { font-weight: 800; font-size: 1rem; color: #1a1d23; }
    .tally-logo-accent { color: #0a8c5e; }
    .tally-tag {
      font-size: 0.65rem;
      background: #fff0ea; color: #c9501a;
      border: 1px solid #fbd5c0;
      padding: 3px 9px; border-radius: 20px;
      font-weight: 600;
    }
    .tally-company-block {
      background: #f8f9fb;
      border: 1px solid #e2e5ea;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 14px;
    }
    .tally-company-name {
      font-size: 0.95rem; font-weight: 700; color: #1a1d23;
    }
    .tally-company-role {
      font-size: 0.78rem; color: #6b7280; margin-top: 3px;
    }
    .tally-question {
      font-size: 0.84rem; color: #1a1d23; margin-bottom: 14px; font-weight: 600;
    }
    .tally-btns { display: flex; gap: 8px; }
    .tally-btns button {
      flex: 1; padding: 10px 8px; border-radius: 9px;
      font-family: inherit; font-size: 0.82rem; font-weight: 700;
      cursor: pointer; border: none; transition: all 0.15s;
    }
    #tally-yes-btn { background: #0a8c5e; color: #fff; }
    #tally-yes-btn:hover { background: #0a7a52; }
    #tally-no-btn {
      background: #f8f9fb; color: #6b7280;
      border: 1.5px solid #e2e5ea !important;
    }
    #tally-no-btn:hover { border-color: #fca5a5 !important; color: #dc2626; background: #fff5f5; }
    .tally-footer {
      font-size: 0.65rem; color: #aab0bb; margin-top: 12px; text-align: center;
    }
  `, 'tally-confirm-styles');

  document.body.appendChild(overlay);

  document.getElementById('tally-yes-btn').onclick = () => {
    overlay.remove();
    onConfirm();
  };
  document.getElementById('tally-no-btn').onclick = () => {
    overlay.remove();
    onDeny();
  };
};

// ── Helpers ──────────────────────────────────

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function injectStyles(css, id) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SHOW_AUTO_TOAST') {
    Tally.showToast(message.jobData, message.todayCount);
  }
  if (message.type === 'SHOW_EXTERNAL_CONFIRM') {
    const jobData = message.jobData;
    Tally.showExternalConfirm(
      jobData,
      () => chrome.runtime.sendMessage({ type: 'EXTERNAL_CONFIRM_RESPONSE', confirmed: true, jobData }),
      () => chrome.runtime.sendMessage({ type: 'EXTERNAL_CONFIRM_RESPONSE', confirmed: false, jobData })
    );
  }
});
