// ─────────────────────────────────────────────
//  Tally — Shared Content Script Utilities
// ─────────────────────────────────────────────

if (window.__tally_shared_loaded) {
  // Already loaded — skip to prevent duplicate declarations
} else {
  window.__tally_shared_loaded = true;

  window.Tally = window.Tally || {};

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

  // Expose helpers globally for other content scripts
  window.Tally.escapeHtml = escapeHtml;
  window.Tally.injectStyles = injectStyles;
}
