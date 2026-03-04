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

const CONFIRM_COOLDOWN_MS = 8000;

// ── Utility ──────────────────────────────────

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

// ── Badge ─────────────────────────────────────

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

// ── Save Application ──────────────────────────

async function saveApplication(jobData) {
  // Guard: don't save blank data
  if ((!jobData.company || jobData.company === 'Unknown Company') &&
      (!jobData.role || jobData.role === 'Unknown Role')) {
    return { success: false, reason: 'no data' };
  }

  const apps = (await getStorage('applications')) || [];

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
    type: jobData.type || 'manual',
    url: jobData.url || '',
    logo: jobData.logo || ''
  };

  apps.unshift(entry);
  await setStorage('applications', apps);
  await updateBadge();
  return { success: true, entry };
}

// ── Pending Queue ─────────────────────────────

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

  if (confirmed) await saveApplication({ ...job, type: 'manual' });
  await updateBadge();
}

// ── Storage helpers for tab tracking ─────────
// All stored in chrome.storage.local so they survive service worker restarts

async function savePendingByOpener(openerTabId, jobData) {
  const all = (await getStorage('pendingByOpener')) || {};
  all[openerTabId] = { jobData, savedAt: Date.now() };
  await setStorage('pendingByOpener', all);
  // Auto-expire after 60 seconds
  setTimeout(async () => {
    const current = (await getStorage('pendingByOpener')) || {};
    if (current[openerTabId]?.savedAt === all[openerTabId]?.savedAt) {
      delete current[openerTabId];
      await setStorage('pendingByOpener', current);
    }
  }, 60000);
}

async function getPendingByOpener(openerTabId) {
  const all = (await getStorage('pendingByOpener')) || {};
  return all[openerTabId]?.jobData || null;
}

async function deletePendingByOpener(openerTabId) {
  const all = (await getStorage('pendingByOpener')) || {};
  delete all[openerTabId];
  await setStorage('pendingByOpener', all);
}

async function savePendingExternalJob(tabId, jobData, openerTabId) {
  const all = (await getStorage('pendingExternalJobs')) || {};
  all[tabId] = { jobData, openerTabId, savedAt: Date.now() };
  await setStorage('pendingExternalJobs', all);
}

async function getPendingExternalJob(tabId) {
  const all = (await getStorage('pendingExternalJobs')) || {};
  return all[tabId] || null;
}

async function deletePendingExternalJob(tabId) {
  const all = (await getStorage('pendingExternalJobs')) || {};
  delete all[tabId];
  await setStorage('pendingExternalJobs', all);
}

// ── Tab Tracking — External Redirect ─────────

chrome.tabs.onCreated.addListener(async (tab) => {
  console.log('[Tally] Tab created — id:', tab.id, 'openerTabId:', tab.openerTabId);
  if (!tab.openerTabId) return;

  const jobData = await getPendingByOpener(tab.openerTabId);
  if (!jobData) return;

  await deletePendingByOpener(tab.openerTabId);
  await savePendingExternalJob(tab.id, jobData, tab.openerTabId);
  console.log('[Tally] ✓ Mapped job to new tab:', tab.id, '| opener:', tab.openerTabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  if (isJobBoard(tab.url)) return;

  // First check pendingExternalJobs (normal flow when onCreated was caught)
  let pending = await getPendingExternalJob(tabId);

  // FIX: If not found, service worker may have been asleep and missed onCreated
  // Use chrome.tabs.get to find the openerTabId and check storage directly
  if (!pending) {
    const tabInfo = await chrome.tabs.get(tabId).catch(() => null);
    if (tabInfo?.openerTabId) {
      const jobData = await getPendingByOpener(tabInfo.openerTabId);
      if (jobData) {
        console.log('[Tally] ✓ Recovered missed onCreated — found job in pendingByOpener');
        await deletePendingByOpener(tabInfo.openerTabId);
        pending = { jobData, openerTabId: tabInfo.openerTabId };
      }
    }
  }

  if (!pending) return;

  const { jobData, openerTabId } = pending;
  await deletePendingExternalJob(tabId);

  // Cooldown check — stored in storage so it survives SW restart
  const cooldowns = (await getStorage('confirmCooldowns')) || {};
  const now = Date.now();
  const last = cooldowns[openerTabId] || 0;
  if (now - last < CONFIRM_COOLDOWN_MS) return;

  cooldowns[openerTabId] = now;
  await setStorage('confirmCooldowns', cooldowns);

  setTimeout(() => {
    chrome.tabs.sendMessage(openerTabId, {
      type: 'SHOW_EXTERNAL_CONFIRM',
      jobData
    }).catch(async () => {
      await addToPending(jobData);
    });
  }, 1500);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await deletePendingExternalJob(tabId);
  const cooldowns = (await getStorage('confirmCooldowns')) || {};
  delete cooldowns[tabId];
  await setStorage('confirmCooldowns', cooldowns);
});

// ── Message Handler ───────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  switch (message.type) {

    case 'EXTERNAL_APPLY_INITIATED': {
      const { jobData } = message;
      const openerTabId = sender.tab?.id;
      console.log('[Tally] EXTERNAL_APPLY_INITIATED — openerTabId:', openerTabId, 'job:', jobData?.company, jobData?.role);

      if (openerTabId) {
        await savePendingByOpener(openerTabId, { ...jobData, type: 'manual' });
        console.log('[Tally] Saved to storage for tab:', openerTabId);
      } else {
        await addToPending(jobData);
      }
      sendResponse({ ok: true });
      break;
    }

    case 'AUTO_APPLY_SUCCESS': {
      const result = await saveApplication({ ...message.jobData, type: 'auto' });
      if (sender.tab?.id) {
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

    case 'EXTERNAL_CONFIRM_RESPONSE': {
      const { confirmed, jobData, pendingId } = message;
      if (pendingId) {
        await resolveFromPending(pendingId, confirmed);
      } else if (confirmed) {
        const result = await saveApplication({ ...jobData, type: 'manual' });
        const apps = (await getStorage('applications')) || [];
        const today = new Date().toDateString();
        const todayCount = apps.filter(a => new Date(a.date).toDateString() === today).length;
        sendResponse({ ...result, todayCount });
        return;
      }
      if (sender.tab?.id) await deletePendingExternalJob(sender.tab.id);
      sendResponse({ ok: true });
      break;
    }

    case 'GET_ALL_DATA': {
      const applications = (await getStorage('applications')) || [];
      const pending = (await getStorage('pending')) || [];
      sendResponse({ applications, pending });
      break;
    }

    case 'GET_STATS': {
      const applications = (await getStorage('applications')) || [];
      const today = new Date().toDateString();
      const todayApps = applications.filter(a => new Date(a.date).toDateString() === today);
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekApps = applications.filter(a => new Date(a.date).getTime() > weekAgo);
      sendResponse({ total: applications.length, today: todayApps.length, week: weekApps.length });
      break;
    }

    case 'DELETE_APPLICATION': {
      const apps = (await getStorage('applications')) || [];
      const filtered = apps.filter(a => a.id !== message.id);
      await setStorage('applications', filtered);
      await updateBadge();
      sendResponse({ ok: true });
      break;
    }

    case 'RESOLVE_PENDING': {
      await resolveFromPending(message.pendingId, message.confirmed);
      sendResponse({ ok: true });
      break;
    }

    case 'CLEAR_ALL': {
      await setStorage('applications', []);
      await setStorage('pending', []);
      await updateBadge();
      sendResponse({ ok: true });
      break;
    }

    case 'GET_PENDING_FOR_TAB': {
      const tabId = sender.tab?.id;
      const pending = tabId ? await getPendingExternalJob(tabId) : null;
      sendResponse({ jobData: pending?.jobData || null });
      break;
    }

    default:
      sendResponse({ ok: false, reason: 'unknown message type' });
  }
}

// Init badge on startup
updateBadge();
