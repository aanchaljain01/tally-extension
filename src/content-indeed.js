// ─────────────────────────────────────────────
//  Tally — Indeed Content Script
// ─────────────────────────────────────────────

(function() {
  'use strict';

  let currentJob = null;

  function scrapeJobDetails() {
    const job = {
      company: '',
      role: '',
      url: window.location.href,
      source: 'Indeed'
    };

    const roleSelectors = [
      '[data-testid="jobsearch-JobInfoHeader-title"] span',
      '.jobsearch-JobInfoHeader-title',
      'h1.icl-u-xs-mb--xs',
      '[class*="jobTitle"] h1',
      'h1'
    ];
    for (const sel of roleSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent.trim()) {
        job.role = el.textContent.trim().replace(/\s+/g, ' ');
        break;
      }
    }

    const companySelectors = [
      '[data-testid="inlineHeader-companyName"] a',
      '[data-testid="inlineHeader-companyName"]',
      '.jobsearch-InlineCompanyRating-companyHeader a',
      '.icl-u-lg-mr--sm.icl-u-xs-mr--sm',
      '[class*="companyName"]'
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

          const successSelectors = [
            '[data-testid="IndeedApplySuccess"]',
            '.ia-SuccessPage',
            '[class*="SuccessPage"]',
            '[class*="successMessage"]'
          ];

          const successTexts = [
            'application submitted',
            'your application has been submitted',
            'successfully applied',
            'thank you for applying'
          ];

          let isSuccess = successSelectors.some(sel =>
            node.matches?.(sel) || node.querySelector?.(sel)
          );

          if (!isSuccess) {
            const text = node.textContent?.toLowerCase() || '';
            isSuccess = successTexts.some(t => text.includes(t));
          }

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

    const isIndeedApply = text === 'apply now' || text === 'apply' ||
      btn.getAttribute('data-testid')?.includes('apply');

    const isExternal = btn.getAttribute('target') === '_blank' ||
      btn.tagName === 'A' && !btn.href?.includes('indeed.com');

    if (isExternal) {
      chrome.runtime.sendMessage({
        type: 'EXTERNAL_APPLY_INITIATED',
        jobData: { ...currentJob, source: 'Indeed' }
      }).catch(() => {});
    } else {
      successObserver?.disconnect();
      successObserver = watchForSuccess();
    }
  }

  document.addEventListener('click', handleApplyClick, true);

  // SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => { currentJob = scrapeJobDetails(); }, 800);
    }
  }).observe(document, { subtree: true, childList: true });

  setTimeout(() => { currentJob = scrapeJobDetails(); }, 1000);

})();
