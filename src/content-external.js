// ─────────────────────────────────────────────
//  Tally — External Site Content Script
//  Runs on ALL pages (not job boards)
//  Shows the Yes/No confirmation popup when
//  the background sends SHOW_EXTERNAL_CONFIRM
// ─────────────────────────────────────────────

(function() {
  'use strict';

  // Known ATS confirmation URL patterns
  const ATS_SUCCESS_PATTERNS = [
    /\/application\/confirmation/i,
    /\/apply\/confirmation/i,
    /\/jobs\/confirmation/i,
    /\/careers\/confirmation/i,
    /\/submission\/confirm/i,
    /\/apply\/thank/i,
    /\/application\/thank/i,
    /\/apply\/success/i,
    /\/application\/success/i,
    /\/submitted/i,
    /myworkdayjobs\.com.*\/confirmation/i,
    /greenhouse\.io.*\/confirmation/i,
    /lever\.co.*\/thanks/i,
    /icims\.com.*\/apply.*\/confirmation/i,
    /taleo\.net.*\/apply.*\/confirm/i,
  ];

  const ATS_SUCCESS_TEXT = [
    'application submitted',
    'application received',
    'thank you for applying',
    'thank you for your application',
    'application complete',
    'successfully submitted',
    'your application has been submitted',
    'we received your application',
    'application confirmation'
  ];

  function isSuccessPage() {
    const url = window.location.href.toLowerCase();
    if (ATS_SUCCESS_PATTERNS.some(p => p.test(url))) return true;

    const bodyText = document.body?.textContent?.toLowerCase() || '';
    return ATS_SUCCESS_TEXT.some(t => bodyText.includes(t));
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function injectStyles(css, id) {
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function showExternalConfirm(jobData) {
    if (document.getElementById('tally-confirm')) return;

    injectStyles(`
      #tally-confirm {
        position: fixed; top: 24px; right: 24px;
        z-index: 2147483647;
        font-family: 'Inter', -apple-system, sans-serif;
        animation: tally-in 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
      }
      @keyframes tally-in {
        from { transform: translateY(-16px) scale(0.94); opacity: 0; }
        to   { transform: translateY(0) scale(1); opacity: 1; }
      }
      .tally-card {
        width: 340px; background: #0a0a0a;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 20px; padding: 22px 22px 18px;
        box-shadow: 0 32px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06);
        text-align: center;
      }
      .tally-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
      .tally-logo { font-weight: 900; font-size: 1.2rem; color: #fff; letter-spacing: -0.03em; }
      .tally-logo span { color: #a0a0a0; }
      .tally-badge {
        font-size: 0.72rem; font-weight: 700;
        background: rgba(255,255,255,0.06); color: #888;
        border: 1px solid rgba(255,255,255,0.1);
        padding: 4px 10px; border-radius: 20px; letter-spacing: 0.04em;
      }
      .tally-emoji { font-size: 2.4rem; margin-bottom: 8px; }
      .tally-question { font-size: 1.5rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; margin-bottom: 14px; }
      .tally-job-block {
        background: #141414; border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; text-align: left;
      }
      .tally-company { font-size: 1.1rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; }
      .tally-role { font-size: 0.88rem; color: #888; margin-top: 4px; font-weight: 500; }
      .tally-btns { display: flex; gap: 8px; }
      .tally-btns button {
        flex: 1; padding: 14px 8px; border-radius: 12px;
        font-family: inherit; font-size: 1rem; font-weight: 800;
        cursor: pointer; border: none; transition: all 0.15s;
      }
      #tally-yes { background: #fff; color: #000; box-shadow: 0 4px 20px rgba(255,255,255,0.12); }
      #tally-yes:hover { transform: translateY(-1px); background: #f0f0f0; }
      #tally-no { background: #141414; color: #666; border: 1px solid rgba(255,255,255,0.08) !important; }
      #tally-no:hover { background: #1c1c1c; color: #999; border-color: rgba(255,255,255,0.15) !important; }
    `, 'tally-external-styles');

    const overlay = document.createElement('div');
    overlay.id = 'tally-confirm';
    overlay.innerHTML = `
      <div class="tally-card">
        <div class="tally-header">
          <div class="tally-logo">Tal<span>ly</span></div>
          <span class="tally-badge">🔗 External Site</span>
        </div>
        <div class="tally-emoji">🎯</div>
        <div class="tally-question">Did you apply?</div>
        <div class="tally-job-block">
          <div class="tally-company">${escapeHtml(jobData.company || 'Unknown company')}</div>
          <div class="tally-role">${escapeHtml(jobData.role || 'Unknown role')}</div>
        </div>
        <div class="tally-btns">
          <button id="tally-yes">✓ Yes!</button>
          <button id="tally-no">✕ Not yet</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('tally-yes').onclick = () => {
      overlay.remove();
      chrome.runtime.sendMessage({
        type: 'EXTERNAL_CONFIRM_RESPONSE',
        confirmed: true,
        jobData
      }, (response) => {
        showToast(jobData, response?.todayCount);
      });
    };

    document.getElementById('tally-no').onclick = () => {
      overlay.remove();
      chrome.runtime.sendMessage({
        type: 'EXTERNAL_CONFIRM_RESPONSE',
        confirmed: false,
        jobData
      });
    };
  }

  function showToast(jobData, todayCount) {
    const existing = document.getElementById('tally-toast');
    if (existing) existing.remove();

    injectStyles(`
      @keyframes tally-toast-in {
        from { transform: translateX(110%) scale(0.95); opacity: 0; }
        to   { transform: translateX(0) scale(1); opacity: 1; }
      }
      @keyframes tally-toast-out {
        from { transform: translateX(0) scale(1); opacity: 1; }
        to   { transform: translateX(110%) scale(0.95); opacity: 0; }
      }
      #tally-toast {
        position: fixed; bottom: 28px; right: 28px; z-index: 2147483647;
        font-family: 'Inter', -apple-system, sans-serif;
        animation: tally-toast-in 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
      }
      .tally-toast-inner {
        background: #0a0a0a; border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px; padding: 16px 18px;
        display: flex; align-items: center; gap: 12px;
        min-width: 280px; max-width: 340px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.8);
      }
      .tally-toast-icon {
        font-size: 1.4rem; width: 40px; height: 40px;
        background: #141414; border-radius: 10px;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .tally-toast-title { font-size: 0.9rem; font-weight: 800; color: #fff; }
      .tally-toast-sub { font-size: 0.78rem; color: #888; margin-top: 2px; }
      .tally-toast-close {
        margin-left: auto; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.08);
        border-radius: 6px; color: #666; cursor: pointer;
        font-size: 0.7rem; padding: 4px 8px; flex-shrink: 0;
      }
      .tally-toast-close:hover { color: #fff; }
    `, 'tally-toast-styles');

    const countLine = todayCount
      ? `<div class="tally-toast-sub">🗂 ${todayCount} applied today</div>`
      : '';

    const toast = document.createElement('div');
    toast.id = 'tally-toast';
    toast.innerHTML = `
      <div class="tally-toast-inner">
        <div class="tally-toast-icon">🎉</div>
        <div>
          <div class="tally-toast-title">Logged!</div>
          <div class="tally-toast-sub">${escapeHtml(jobData.company)} · ${escapeHtml(jobData.role)}</div>
          ${countLine}
        </div>
        <button class="tally-toast-close" id="tally-toast-close">✕</button>
      </div>
    `;
    document.body.appendChild(toast);

    document.getElementById('tally-toast-close').onclick = () => toast.remove();
    setTimeout(() => {
      if (document.getElementById('tally-toast')) {
        toast.style.animation = 'tally-toast-out 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4000);
  }

  // ── Auto-detect ATS success pages ─────────

  function checkForAutoSuccess() {
    if (!isSuccessPage()) return;

    chrome.runtime.sendMessage({ type: 'GET_PENDING_FOR_TAB' }, (response) => {
      if (response?.jobData) {
        chrome.runtime.sendMessage({
          type: 'EXTERNAL_CONFIRM_RESPONSE',
          confirmed: true,
          jobData: response.jobData
        });
        showToast(response.jobData);
      }
    });
  }

  // ── Message listener ──────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SHOW_EXTERNAL_CONFIRM') {
      showExternalConfirm(message.jobData);
    }
  });

  // Check on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkForAutoSuccess);
  } else {
    setTimeout(checkForAutoSuccess, 1000);
  }

})();
