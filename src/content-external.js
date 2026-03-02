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

  // Helpers (inline since we can't import shared util in MV3 easily)
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

    const overlay = document.createElement('div');
    overlay.id = 'tally-confirm';
    overlay.innerHTML = `
      <div class="tally-confirm-card">
        <div class="tally-confirm-header">
          <span class="tally-logo">Wing<span class="tally-accent">man</span></span>
          <span class="tally-confirm-tag">🔗 External Site</span>
        </div>
        <div class="tally-confirm-company">
          <div class="tally-confirm-co">${escapeHtml(jobData.company || 'This company')}</div>
          <div class="tally-confirm-role">${escapeHtml(jobData.role || 'Unknown role')}</div>
        </div>
        <div class="tally-confirm-q">Did you submit your application?</div>
        <div class="tally-confirm-btns">
          <button id="tally-yes">✓ Yes, Applied</button>
          <button id="tally-no">✕ Not yet</button>
        </div>
        <div class="tally-confirm-footer">Via ${escapeHtml(jobData.source || 'job board')}</div>
      </div>
    `;

    injectStyles(`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;800&display=swap');
      #tally-confirm {
        position: fixed; top: 20px; right: 20px;
        z-index: 2147483647;
        font-family: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
        animation: tally-popin 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes tally-popin {
        from { transform: scale(0.85) translateY(-10px); opacity: 0; }
        to   { transform: scale(1) translateY(0); opacity: 1; }
      }
      .tally-confirm-card {
        background: #16161a; border: 1px solid #2a2a35;
        border-radius: 14px; padding: 18px 20px; width: 280px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,107,53,0.15);
      }
      .tally-confirm-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 14px;
      }
      .tally-logo { font-weight: 800; font-size: 0.9rem; color: #e8e8f0; }
      .tally-accent { color: #00e5a0; }
      .tally-confirm-tag {
        font-size: 0.62rem; font-family: monospace;
        background: rgba(255,107,53,0.12); color: #ff6b35;
        padding: 3px 8px; border-radius: 20px;
      }
      .tally-confirm-company {
        background: rgba(255,255,255,0.04); border: 1px solid #2a2a35;
        border-radius: 8px; padding: 10px 12px; margin-bottom: 14px;
      }
      .tally-confirm-co { font-size: 0.88rem; font-weight: 700; color: #e8e8f0; }
      .tally-confirm-role { font-size: 0.75rem; color: #9999aa; margin-top: 2px; }
      .tally-confirm-q { font-size: 0.82rem; color: #c8c8d8; margin-bottom: 12px; }
      .tally-confirm-btns { display: flex; gap: 8px; }
      .tally-confirm-btns button {
        flex: 1; padding: 9px 8px; border-radius: 8px;
        font-family: inherit; font-size: 0.8rem; font-weight: 700;
        cursor: pointer; border: none; transition: all 0.15s;
      }
      #tally-yes { background: #00e5a0; color: #000; }
      #tally-yes:hover { background: #00ffb3; }
      #tally-no {
        background: transparent; color: #9999aa;
        border: 1px solid #2a2a35 !important;
      }
      #tally-no:hover { border-color: #ff6b35 !important; color: #ff6b35; }
      .tally-confirm-footer {
        font-size: 0.62rem; color: #555566; margin-top: 10px;
        font-family: monospace; text-align: center;
      }
    `, 'tally-external-styles');

    document.body.appendChild(overlay);

    document.getElementById('tally-yes').onclick = () => {
      overlay.remove();
      chrome.runtime.sendMessage({
        type: 'EXTERNAL_CONFIRM_RESPONSE',
        confirmed: true,
        jobData
      }, (response) => {
        showAutoDetectedToast(jobData, response?.todayCount);
      });
    };

    document.getElementById('tally-no').onclick = () => {
      overlay.remove();
      chrome.runtime.sendMessage({
        type: 'EXTERNAL_CONFIRM_RESPONSE',
        confirmed: false,
        jobData
      }).catch(() => {});
    };
  }

  function showAutoDetectedToast(jobData, todayCount) {
    const existing = document.getElementById('tally-toast');
    if (existing) existing.remove();

    const countLine = todayCount
      ? `<div style="font-size:0.72rem;color:#6b7280;margin-top:4px">🗂 ${todayCount} applied today</div>`
      : '';

    const toast = document.createElement('div');
    toast.id = 'tally-toast';
    toast.innerHTML = `
      <div id="tally-ext-toast-inner" style="
        position:fixed; bottom:28px; right:28px; z-index:2147483647;
        background:#fff; border:1.5px solid #0a8c5e; border-radius:14px;
        padding:16px 14px 16px 16px; min-width:300px; max-width:340px;
        display:flex; align-items:flex-start; gap:12px;
        font-family:'Syne',-apple-system,sans-serif;
        box-shadow:0 4px 24px rgba(0,0,0,0.12), 0 0 0 4px #e6f7f2;
        animation: tally-ext-in 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
      ">
        <div style="background:#e6f7f2;border-radius:10px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem">🎯</div>
        <div style="flex:1;padding-top:1px">
          <div style="font-size:0.85rem;font-weight:700;color:#0a8c5e">Logged!</div>
          <div style="font-size:0.78rem;color:#1a1d23;margin-top:3px;font-weight:600">${escapeHtml(jobData.company)} · ${escapeHtml(jobData.role)}</div>
          ${countLine}
        </div>
        <button id="tally-ext-close" style="
          background:#f8f9fb;border:1px solid #e2e5ea;border-radius:6px;
          color:#6b7280;cursor:pointer;font-size:0.7rem;padding:4px 7px;
          flex-shrink:0;margin-top:1px;transition:all 0.15s;
        ">✕</button>
      </div>
    `;
    injectStyles(`@keyframes tally-ext-in { from { transform:translateX(110%) scale(0.95); opacity:0; } to { transform:translateX(0) scale(1); opacity:1; } }`, 'tally-ext-anim');
    document.body.appendChild(toast);

    // Stays until closed — no auto-timeout
    document.getElementById('tally-ext-close').onclick = () => toast.remove();
  }

  // ── Auto-detect ATS success pages ─────────

  function checkForAutoSuccess() {
    if (!isSuccessPage()) return;

    // Ask background if we have a pending job for this tab
    chrome.runtime.sendMessage({ type: 'GET_PENDING_FOR_TAB' }, (response) => {
      if (response?.jobData) {
        // Auto-confirm since we're on a success page
        chrome.runtime.sendMessage({
          type: 'EXTERNAL_CONFIRM_RESPONSE',
          confirmed: true,
          jobData: response.jobData
        }).catch(() => {});
        showAutoDetectedToast(response.jobData);
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
