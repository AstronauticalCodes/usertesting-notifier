// service-worker.js
// All listeners registered synchronously at top-level (required for SW restart replay)

const ALARM_NAME = 'ut-poll';
const POLL_INTERVAL_MINUTES = 0.5; // Poll every 30 seconds (minimum Chrome allows)
const USERTESTING_URL = 'https://www.usertesting.com/be-a-user';

// ── Initialization ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      lastCount: 0,
      enabled: true,
      soundEnabled: true,
      notifiedIds: [],
    });
  }

  // Ensure the alarm is running
  await ensureAlarm();
  updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  updateBadge();
});

// ── Alarm handler ─────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const { enabled } = await chrome.storage.local.get({ enabled: true });
  if (!enabled) return;

  await checkForOpportunities();
});

// ── Message handler (from popup) ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'CHECK_NOW') {
      await checkForOpportunities();
      sendResponse({ ok: true });
    } else if (message.type === 'GET_STATE') {
      const state = await chrome.storage.local.get({
        lastCount: 0,
        enabled: true,
        soundEnabled: true,
        lastChecked: null,
      });
      sendResponse(state);
    } else if (message.type === 'SET_ENABLED') {
      await chrome.storage.local.set({ enabled: message.value });
      if (message.value) {
        await ensureAlarm();
        await checkForOpportunities();
      } else {
        await chrome.alarms.clear(ALARM_NAME);
        await chrome.action.setBadgeText({ text: '' });
      }
      sendResponse({ ok: true });
    } else if (message.type === 'SET_SOUND') {
      await chrome.storage.local.set({ soundEnabled: message.value });
      sendResponse({ ok: true });
    }
  })();
  return true; // Keep message channel open for async response
});

// ── Core: check for opportunities ────────────────────────────────────────────

async function checkForOpportunities() {
  try {
    // Try to find an open UserTesting tab first to scrape live data
    const tabs = await chrome.tabs.query({ url: 'https://www.usertesting.com/*' });

    let count = 0;

    if (tabs.length > 0) {
      // Scrape the opportunity count from an existing tab
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: scrapeOpportunityCount,
      });
      count = results?.[0]?.result ?? 0;
    } else {
      // No open tab — open one silently in the background
      const tab = await chrome.tabs.create({
        url: USERTESTING_URL,
        active: false,
      });
      // Wait for it to load, then scrape
      count = await waitForTabAndScrape(tab.id);
      // Close background tab after scraping
      await chrome.tabs.remove(tab.id);
    }

    await handleCountResult(count);
  } catch (err) {
    console.error('[UT Notifier] Check failed:', err);
  }
}

// Injected into the page — runs in page context
function scrapeOpportunityCount() {
  // Method 1: Tab title contains "(N)" when opportunities exist
  const titleMatch = document.title.match(/\((\d+)\)/);
  if (titleMatch) return parseInt(titleMatch[1], 10);

  // Method 2: Count visible opportunity cards
  const cards = document.querySelectorAll(
    '[data-testid="opportunity-card"], .opportunity-card, .test-invite'
  );
  if (cards.length > 0) return cards.length;

  // Method 3: Look for the badge/counter element in the nav
  const badge = document.querySelector(
    '[data-testid="surveys-badge"], .nav-badge, .opportunity-count'
  );
  if (badge) {
    const n = parseInt(badge.textContent.trim(), 10);
    if (!isNaN(n)) return n;
  }

  // Method 4: Check the "N feedback opportunity" heading text
  const heading = [...document.querySelectorAll('h1, h2, h3, p, div')].find(
    (el) => /\d+\s+feedback\s+opportunit/i.test(el.textContent)
  );
  if (heading) {
    const match = heading.textContent.match(/(\d+)\s+feedback/i);
    if (match) return parseInt(match[1], 10);
  }

  return 0;
}

async function waitForTabAndScrape(tabId) {
  return new Promise((resolve) => {
    const listener = async (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(listener);

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: scrapeOpportunityCount,
        });
        resolve(results?.[0]?.result ?? 0);
      } catch {
        resolve(0);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    // Timeout fallback: 15s
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(0);
    }, 15000);
  });
}

async function handleCountResult(count) {
  const { lastCount = 0, soundEnabled = true } = await chrome.storage.local.get({
    lastCount: 0,
    soundEnabled: true,
  });

  const now = Date.now();
  await chrome.storage.local.set({ lastCount: count, lastChecked: now });

  updateBadge(count);

  // Only notify when new opportunities appear (count increased)
  if (count > 0 && count > lastCount) {
    const diff = count - lastCount;
    const title = diff === 1
      ? '🎉 New UserTesting Opportunity!'
      : `🎉 ${diff} New UserTesting Opportunities!`;
    const message = count === 1
      ? '1 test opportunity is waiting for you. Tap to open UserTesting.'
      : `${count} test opportunities are waiting for you. Tap to open UserTesting.`;

    // Generate icon data URL at runtime (no file dependency)
    const iconUrl = await getIconDataUrl();

    await chrome.notifications.create('ut-new-opportunity', {
      type: 'basic',
      iconUrl,
      title,
      message,
      priority: 2,
      requireInteraction: true, // Stays on screen until dismissed
    });
  }
}

// ── Notification click → open UserTesting ────────────────────────────────────

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith('ut-')) return;
  await chrome.notifications.clear(notificationId);

  // Focus existing tab or open new one
  const tabs = await chrome.tabs.query({ url: 'https://www.usertesting.com/*' });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: USERTESTING_URL });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 0.1,
      periodInMinutes: POLL_INTERVAL_MINUTES,
    });
  }
}

function updateBadge(count) {
  if (count === undefined || count === null) {
    chrome.storage.local.get({ lastCount: 0 }, ({ lastCount }) => {
      setBadge(lastCount);
    });
    return;
  }
  setBadge(count);
}

function setBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Generate a blue rounded-square icon as a data URL (no image file needed)
async function getIconDataUrl() {
  const size = 128;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  const r = size / 4;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = '#3B4EFF';
  ctx.fill();

  // "U" letter
  ctx.fillStyle = 'white';
  ctx.font = `bold ${size * 0.5}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('U', size / 2, size / 2);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(/** @type {string} */ (reader.result));
    reader.readAsDataURL(blob);
  });
}
