// ─────────────────────────────────────────────
//  Tally — Handshake Content Script
// ─────────────────────────────────────────────

(function() {
  'use strict';

  let currentJob = null;

  function scrapeJobDetails() {
    const job = {
      company: '',
      role: '',
      url: window.location.href,
      source: 'Handshake'
    };

    const roleSelectors = [
      '[data-hook="job-name"]',
      '.job-title',
      'h1[class*="title"]',
      '.posting-title h1',
      'h1'
    ];
    for (const sel of roleSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent.trim()) {
        job.role = el.textContent.trim();
        break;
      }
    }

    const companySelectors = [
      '[data-hook="employer-name"]',
      '.employer-name a',
      '.employer-name',
      '[class*="employerName"]',
      '[class*="company-name"]'
    ];
    for (const sel of companySelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent.trim()) {
        job.company = el.textContent.trim();
        break;
      }
    }

    return (job.role || job.company) ? job : null;
  }

  function watchForSuccess() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;

          const successTexts = [
            'application submitted',
            'successfully applied',
            'your application has been received',
            'application complete'
          ];

          const text = node.textContent?.toLowerCase() || '';
          const isSuccess = successTexts.some(t => text.includes(t)) ||
            node.querySelector?.('[class*="success"], [class*="confirmation"]');

          if (isSuccess && currentJob) {
            observer.disconnect();
            chrome.runtime.sendMessage({
              type: 'AUTO_APPLY_SUCCESS',
              jobData: { ...currentJob, type: 'auto' }
            }).catch(() => {});
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }

  let successObserver = null;

  function handleApplyClick(e) {
    const btn = e.target.closest('button, a');
    if (!btn) return;

    const text = btn.textContent?.trim().toLowerCase() || '';
    if (!text.includes('apply')) return;

    currentJob = scrapeJobDetails() || currentJob;
    if (!currentJob) return;

    const isExternal = btn.getAttribute('target') === '_blank' ||
      (btn.tagName === 'A' && btn.href && !btn.href.includes('handshake'));

    if (isExternal) {
      chrome.runtime.sendMessage({
        type: 'EXTERNAL_APPLY_INITIATED',
        jobData: { ...currentJob, source: 'Handshake' }
      }).catch(() => {});
    } else {
      successObserver?.disconnect();
      successObserver = watchForSuccess();
    }
  }

  document.addEventListener('click', handleApplyClick, true);

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => { currentJob = scrapeJobDetails(); }, 800);
    }
  }).observe(document, { subtree: true, childList: true });

  setTimeout(() => { currentJob = scrapeJobDetails(); }, 1000);

})();
