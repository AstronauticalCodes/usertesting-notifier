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
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
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
  const now = Date.now();
  await chrome.storage.local.set({ lastCount: count, lastChecked: now });
}

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
