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

async function checkForOpportunities() {
  // To be implemented in next phase
}
