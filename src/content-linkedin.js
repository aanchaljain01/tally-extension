// ─────────────────────────────────────────────
//  Tally — LinkedIn Content Script
//  Simple flow: job ID → API fetch → popup on apply click
// ─────────────────────────────────────────────

(function() {
  'use strict';
  if (window.__tally_loaded) return;
  window.__tally_loaded = true;

  let currentJob = null;
  let popupShowing = false;
  let lastPopupAt = 0;
  const POPUP_COOLDOWN_MS = 8000;
  let applyTimeout = null;
  let applyMode = null; // 'easy' or 'external'

  console.log('[Tally] LinkedIn script loaded ✓');

  // ── Scrape job details directly from the DOM ────

  function scrapeFromDOM() {
    const roleSelectors = [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      'h1.t-24',
      'h1[class*="job-title"]',
      'h1'
    ];

    const companySelectors = [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      'a[href*="/company/"]'
    ];

    let role = '';
    let company = '';

    for (const sel of roleSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        role = el.textContent.trim().replace(/\s+/g, ' ');
        break;
      }
    }

    for (const sel of companySelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        company = el.textContent.trim().replace(/\s+/g, ' ');
        break;
      }
    }

    return { role, company };
  }

  // ── Fetch job details from LinkedIn guest API ────

  function fetchJobDetails() {
    const jobId = new URL(location.href).searchParams.get('currentJobId');
    if (!jobId) return;

    currentJob = { company: '', role: '', url: location.href, source: 'LinkedIn' };

    // First scrape from DOM immediately
    const dom = scrapeFromDOM();
    if (dom.role)    currentJob.role    = dom.role;
    if (dom.company) currentJob.company = dom.company;
    console.log('[Tally] DOM scrape:', currentJob.role, 'at', currentJob.company);

    // Then try guest API as backup
    fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`)
      .then(r => r.text())
      .then(html => {
        const rolePatterns = [
          /<h1[^>]*class="t-24 t-bold inline"[^>]*>(?:<a[^>]*>)?([^<]+)/,
          /class="[^"]*topcard__title[^"]*"[^>]*>([^<]+)/,
          /job-details-jobs-unified-top-card__job-title[\s\S]*?<h1[^>]*>([^<]+)/,
          /"jobTitle"\s*:\s*"([^"]+)"/
        ];

        const companyPatterns = [
          /href="https:\/\/www\.linkedin\.com\/company\/[^"]*"[^>]*>\s*([^<<!--]+)/,
          /topcard__org-name-link[^>]*>\s*([^<]+)/,
          /"companyName"\s*:\s*"([^"]+)"/
        ];

        for (const pattern of rolePatterns) {
          const match = html.match(pattern);
          if (match?.[1]?.trim()) { currentJob.role = match[1].trim(); break; }
        }

        for (const pattern of companyPatterns) {
          const match = html.match(pattern);
          if (match?.[1]?.trim()) { currentJob.company = match[1].trim(); break; }
        }

        // Keep DOM values if API returned nothing
        if (!currentJob.role)    currentJob.role    = dom.role    || 'Unknown Role';
        if (!currentJob.company) currentJob.company = dom.company || 'Unknown Company';

        console.log('[Tally] Job ready:', currentJob.role, 'at', currentJob.company);
      })
      .catch(() => {
        currentJob.role    = dom.role    || 'Unknown Role';
        currentJob.company = dom.company || 'Unknown Company';
        console.log('[Tally] API failed, using DOM:', currentJob.role, 'at', currentJob.company);
      });
  }

  // ── Show Yes/No popup ──────────────────────

  function showConfirmPopup() {
    const now = Date.now();
    if (now - lastPopupAt < POPUP_COOLDOWN_MS) return;
    lastPopupAt = now;

    if (popupShowing || document.getElementById('tally-confirm')) return;
    popupShowing = true;

    // Re-scrape from DOM at popup time in case fetch hasn't resolved yet
    if (!currentJob?.role || !currentJob?.company ||
        currentJob.role === '' || currentJob.company === '') {
      const dom = scrapeFromDOM();
      if (!currentJob) currentJob = { url: location.href, source: 'LinkedIn' };
      if (dom.role)    currentJob.role    = dom.role;
      if (dom.company) currentJob.company = dom.company;
    }

    const job = currentJob || {};

    function esc(str) {
      const d = document.createElement('div');
      d.textContent = str || '';
      return d.innerHTML;
    }

    function injectStyles(css, id) {
      if (document.getElementById(id)) return;
      const s = document.createElement('style');
      s.id = id; s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }

    injectStyles(`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800;900&display=swap');
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
    `, 'tally-styles');

    const el = document.createElement('div');
    el.id = 'tally-confirm';
    el.innerHTML = `
      <div class="tally-card">
        <div class="tally-header">
          <div class="tally-logo">Tal<span>ly</span></div>
          <span class="tally-badge">💼 LinkedIn</span>
        </div>
        <div class="tally-emoji">🎯</div>
        <div class="tally-question">Did you apply?</div>
        <div class="tally-job-block">
          <div class="tally-company">${esc(job.company || 'Unknown company')}</div>
          <div class="tally-role">${esc(job.role || 'Unknown role')}</div>
        </div>
        <div class="tally-btns">
          <button id="tally-yes">✓ Yes!</button>
          <button id="tally-no">✕ Not yet</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    document.getElementById('tally-yes').onclick = () => {
      el.remove();
      popupShowing = false;

      const finalJob = {
        company: currentJob?.company || 'Unknown Company',
        role:    currentJob?.role    || 'Unknown Role',
        url:     location.href,
        source:  'LinkedIn'
      };

      console.log('[Tally] Saving:', finalJob.company, finalJob.role, 'Mode:', applyMode);

      if (applyMode === 'easy') {
        chrome.runtime.sendMessage(
          { type: 'AUTO_APPLY_SUCCESS', jobData: finalJob },
          () => {
            chrome.runtime.sendMessage({ type: 'GET_STATS' }, (stats) => {
              showYay(finalJob, stats?.today);
            });
          }
        );
      } else {
        chrome.runtime.sendMessage(
          { type: 'EXTERNAL_CONFIRM_RESPONSE', confirmed: true, jobData: finalJob },
          (res) => { showYay(finalJob, res?.todayCount); }
        );
      }

      applyMode = null;
    };

    document.getElementById('tally-no').onclick = () => {
      el.remove();
      popupShowing = false;
      applyMode = null;
    };
  }

  // ── Toast ──────────────────────────────────

  function showYay(job, todayCount) {
    const existing = document.getElementById('tally-yay');
    if (existing) existing.remove();

    const count = todayCount || 1;
    const msgs = [`That's 1 today! 🎯`, `That's 2 today! 🔥`, `That's 3 today! 🚀`, `That's 4 today! 💪`, `That's 5 today! 🎯`, `That's ${count} today! 🏆`];
    const msg = msgs[Math.min(count - 1, msgs.length - 1)];

    const el = document.createElement('div');
    el.id = 'tally-yay';
    el.innerHTML = `
      <div id="tally-yay-inner" style="position:fixed;top:24px;right:24px;z-index:2147483647;background:#0a0a0a;border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:28px 24px;width:320px;font-family:'Inter',-apple-system,sans-serif;box-shadow:0 32px 80px rgba(0,0,0,0.8);text-align:center;animation:tally-yay-in 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;">
        <style>@keyframes tally-yay-in{from{transform:translateY(-16px) scale(0.9);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}@keyframes tally-yay-out{from{transform:scale(1);opacity:1}to{transform:scale(0.9) translateY(-8px);opacity:0}}</style>
        <div style="font-size:3rem;margin-bottom:12px">🎉</div>
        <div style="font-size:1.4rem;font-weight:900;color:#fff;letter-spacing:-0.03em;margin-bottom:6px">Logged!</div>
        <div style="font-size:1rem;font-weight:700;color:#888;margin-bottom:16px">${msg}</div>
        <div style="background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 14px;text-align:left;">
          <div style="font-size:0.95rem;font-weight:800;color:#fff">${job.company}</div>
          <div style="font-size:0.82rem;color:#666;margin-top:3px">${job.role}</div>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    setTimeout(() => {
      const inner = document.getElementById('tally-yay-inner');
      if (inner) {
        inner.style.animation = 'tally-yay-out 0.3s ease forwards';
        setTimeout(() => { const y = document.getElementById('tally-yay'); if (y) y.remove(); }, 300);
      }
    }, 3000);
  }

  // ── Detect any apply button click ─────────
  // Fixed: handles clicks on span/svg inside buttons using artdeco-button selector

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, a, [class*="artdeco-button"]');
    if (!btn) return;

    const text = btn.textContent?.trim().toLowerCase() || '';
    const aria = btn.getAttribute?.('aria-label')?.toLowerCase() || '';

    if (!text.includes('apply') && !aria.includes('apply')) return;

    console.log('[Tally] Apply click detected');

    clearTimeout(applyTimeout);
    applyTimeout = null;

    const isEasyApply = text.includes('easy apply') || aria.includes('easy apply');
    applyMode = isEasyApply ? 'easy' : 'external';

    const thisTimeout = setTimeout(() => {
      if (applyTimeout === thisTimeout && !popupShowing) showConfirmPopup();
    }, 3000);

    applyTimeout = thisTimeout;
  });

  // ── Watch for job ID changes in URL ────────

  let lastJobId = new URL(location.href).searchParams.get('currentJobId');

  new MutationObserver(() => {
    const newJobId = new URL(location.href).searchParams.get('currentJobId');
    if (newJobId && newJobId !== lastJobId) {
      lastJobId = newJobId;
      popupShowing = false;
      clearTimeout(applyTimeout);
      fetchJobDetails();
    }
  }).observe(document, { subtree: true, childList: true });

  // ── Messages from background ──────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SHOW_AUTO_TOAST') {
      showYay(message.jobData, message.todayCount);
    }
  });

  // ── Init ──────────────────────────────────

  setTimeout(() => {
    fetchJobDetails();
    console.log('[Tally] Ready');
  }, 1000);

})();