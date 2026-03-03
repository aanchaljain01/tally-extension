// ─────────────────────────────────────────────
//  Tally — Background Service Worker
//  Handles: tab events, cross-script messaging,
//           badge updates, storage operations
// ─────────────────────────────────────────────

const JOB_BOARD_ORIGINS = [
  'linkedin.com',
  'indeed.com',
  'joinhandshake.com',
  'app.joinhandshake.com'
];


const pendingExternalJobs = new Map(); 
const confirmCooldownByOpener = new Map(); 
const CONFIRM_COOLDOWN_MS = 8000;
// ── Utility ─────────────────────────────────

function isJobBoard(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return JOB_BOARD_ORIGINS.some(origin => host.endsWith(origin));
  } catch {
    return false;
  }
}

async function getStorage(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => resolve(result[key]));
  });
}

async function setStorage(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

// ── Badge ────────────────────────────────────

async function updateBadge() {
  const apps = (await getStorage('applications')) || [];
  const today = new Date().toDateString();
  const todayCount = apps.filter(a => new Date(a.date).toDateString() === today).length;
  const pending = (await getStorage('pending')) || [];

  if (pending.length > 0) {
    chrome.action.setBadgeText({ text: `${pending.length}` });
    chrome.action.setBadgeBackgroundColor({ color: '#ff6b35' });
  } else if (todayCount > 0) {
    chrome.action.setBadgeText({ text: `${todayCount}` });
    chrome.action.setBadgeBackgroundColor({ color: '#00e5a0' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ── Save Application ─────────────────────────

async function saveApplication(jobData) {
  const apps = (await getStorage('applications')) || [];

  // Duplicate check: same company + role within last 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const duplicate = apps.find(a =>
    a.company?.toLowerCase() === jobData.company?.toLowerCase() &&
    a.role?.toLowerCase() === jobData.role?.toLowerCase() &&
    new Date(a.date).getTime() > sevenDaysAgo
  );

  if (duplicate) {
    return { success: false, reason: 'duplicate', existing: duplicate };
  }

  const entry = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    company: jobData.company || 'Unknown Company',
    role: jobData.role || 'Unknown Role',
    date: new Date().toISOString(),
    source: jobData.source || 'unknown',
    type: jobData.type || 'manual', // 'auto' | 'manual'
    url: jobData.url || '',
    logo: jobData.logo || ''
  };

  apps.unshift(entry);
  await setStorage('applications', apps);
  await updateBadge();
  return { success: true, entry };
}

// ── Pending Queue ────────────────────────────

async function addToPending(jobData) {
  const pending = (await getStorage('pending')) || [];
  const id = `pending_${Date.now()}`;
  pending.push({ ...jobData, pendingId: id, pendingAt: Date.now() });
  await setStorage('pending', pending);
  await updateBadge();
  return id;
}

async function resolveFromPending(pendingId, confirmed) {
  const pending = (await getStorage('pending')) || [];
  const idx = pending.findIndex(p => p.pendingId === pendingId);
  if (idx === -1) return;

  const job = pending[idx];
  pending.splice(idx, 1);
  await setStorage('pending', pending);

  if (confirmed) {
    await saveApplication({ ...job, type: 'manual' });
  }

  await updateBadge();
}

// ── Tab Tracking — External Redirect ────────


const pendingByOpener = new Map();

// When a new tab is created, check if its opener has a pending job
chrome.tabs.onCreated.addListener(async (tab) => {
  console.log('[Tally] Tab created — id:', tab.id, 'openerTabId:', tab.openerTabId);

  if (!tab.openerTabId) return;
  if (!pendingByOpener.has(tab.openerTabId)) return;

  const jobData = pendingByOpener.get(tab.openerTabId);
  pendingByOpener.delete(tab.openerTabId);

  // Store both jobData AND openerTabId so we can send popup back to LinkedIn tab
  pendingExternalJobs.set(tab.id, { jobData, openerTabId: tab.openerTabId });
  console.log('[Tally] ✓ Mapped job to new tab:', tab.id, '| will send popup back to:', tab.openerTabId);

});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  if (isJobBoard(tab.url)) return;
  if (!pendingExternalJobs.has(tabId)) return;

  const { jobData, openerTabId } = pendingExternalJobs.get(tabId);

  
  pendingExternalJobs.delete(tabId);

  
  const now = Date.now();
  const last = confirmCooldownByOpener.get(openerTabId) || 0;
  if (now - last < CONFIRM_COOLDOWN_MS) return;
  confirmCooldownByOpener.set(openerTabId, now);

  setTimeout(() => {
    chrome.tabs.sendMessage(openerTabId, {
      type: 'SHOW_EXTERNAL_CONFIRM',
      jobData
    }).catch(async () => {
      await addToPending(jobData);
    });
  }, 1500);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  pendingExternalJobs.delete(tabId);
});

// ── Message Handler ──────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // keep channel open for async
});

async function handleMessage(message, sender, sendResponse) {
  switch (message.type) {

    // Content script found a job listing and user is about to apply externally
    case 'EXTERNAL_APPLY_INITIATED': {
      const { jobData } = message;
      const openerTabId = sender.tab?.id;

      console.log('[Tally] EXTERNAL_APPLY_INITIATED received — openerTabId:', openerTabId, 'job:', jobData?.company, jobData?.role);

      if (openerTabId) {
        pendingByOpener.set(openerTabId, { ...jobData, type: 'manual' });
        console.log('[Tally] Stored in pendingByOpener for tab:', openerTabId);
        setTimeout(() => pendingByOpener.delete(openerTabId), 30000);
      } else {
        console.warn('[Tally] No openerTabId — adding to pending queue');
        await addToPending(jobData);
      }
      sendResponse({ ok: true });
      break;
    }

    // Easy Apply auto-detected success
    case 'AUTO_APPLY_SUCCESS': {
      const result = await saveApplication({ ...message.jobData, type: 'auto' });
      if (sender.tab?.id) {
        // Compute today's count after saving
        const apps = (await getStorage('applications')) || [];
        const today = new Date().toDateString();
        const todayCount = apps.filter(a => new Date(a.date).toDateString() === today).length;

        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'SHOW_AUTO_TOAST',
          jobData: message.jobData,
          todayCount,
          result
        }).catch(() => {});
      }
      sendResponse(result);
      break;
    }

    // User confirmed or denied an external application
    case 'EXTERNAL_CONFIRM_RESPONSE': {
      const { confirmed, jobData, pendingId } = message;
      if (pendingId) {
        await resolveFromPending(pendingId, confirmed);
      } else if (confirmed) {
        const result = await saveApplication({ ...jobData, type: 'manual' });
        // Compute todayCount and send back for toast
        const apps = (await getStorage('applications')) || [];
        const today = new Date().toDateString();
        const todayCount = apps.filter(a => new Date(a.date).toDateString() === today).length;
        sendResponse({ ...result, todayCount });
        return;
      }
      if (sender.tab?.id) {
        pendingExternalJobs.delete(sender.tab.id);
      }
      sendResponse({ ok: true });
      break;
    }

    // Popup requests all data
    case 'GET_ALL_DATA': {
      const applications = (await getStorage('applications')) || [];
      const pending = (await getStorage('pending')) || [];
      sendResponse({ applications, pending });
      break;
    }

    // Popup requests stats
    case 'GET_STATS': {
      const applications = (await getStorage('applications')) || [];
      const today = new Date().toDateString();
      const todayApps = applications.filter(a => new Date(a.date).toDateString() === today);
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekApps = applications.filter(a => new Date(a.date).getTime() > weekAgo);
      sendResponse({
        total: applications.length,
        today: todayApps.length,
        week: weekApps.length
      });
      break;
    }

    // Delete a single application
    case 'DELETE_APPLICATION': {
      const apps = (await getStorage('applications')) || [];
      const filtered = apps.filter(a => a.id !== message.id);
      await setStorage('applications', filtered);
      await updateBadge();
      sendResponse({ ok: true });
      break;
    }

    // Resolve a pending item from popup
    case 'RESOLVE_PENDING': {
      await resolveFromPending(message.pendingId, message.confirmed);
      sendResponse({ ok: true });
      break;
    }

    // Clear all data
    case 'CLEAR_ALL': {
      await setStorage('applications', []);
      await setStorage('pending', []);
      await updateBadge();
      sendResponse({ ok: true });
      break;
    }

    // External content script asks if there's a pending job for this tab
    case 'GET_PENDING_FOR_TAB': {
      const tabId = sender.tab?.id;
      if (tabId && pendingExternalJobs.has(tabId)) {
        const jobData = pendingExternalJobs.get(tabId);
        sendResponse({ jobData });
      } else {
        sendResponse({ jobData: null });
      }
      break;
    }

    default:
      sendResponse({ ok: false, reason: 'unknown message type' });
  }
}


// Init badge on startup
updateBadge();

