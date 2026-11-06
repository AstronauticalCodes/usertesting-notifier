// popup.js

const $ = (id) => document.getElementById(id);

async function init() {
  const state = await sendMessage({ type: 'GET_STATE' });

  renderCount(state.lastCount);
  renderLastChecked(state.lastChecked);

  $('enabledToggle').checked = state.enabled;
  $('soundToggle').checked = state.soundEnabled;
}

function renderCount(count) {
  const countEl = $('opportunityCount');
  countEl.textContent = count ?? '—';
  countEl.classList.toggle('has-opportunities', count > 0);
}

function renderLastChecked(ts) {
  if (!ts) {
    $('lastChecked').textContent = 'Not checked yet';
    return;
  }
  const diff = Math.round((Date.now() - ts) / 1000);
  const text = diff < 10
    ? 'Just now'
    : diff < 60
      ? `${diff}s ago`
      : `${Math.round(diff / 60)}m ago`;
  $('lastChecked').textContent = `Last checked: ${text}`;
}

$('enabledToggle').addEventListener('change', async (e) => {
  await sendMessage({ type: 'SET_ENABLED', value: e.target.checked });
});

$('soundToggle').addEventListener('change', async (e) => {
  await sendMessage({ type: 'SET_SOUND', value: e.target.checked });
});

$('checkNow').addEventListener('click', async () => {
  const btn = $('checkNow');
  btn.disabled = true;
  btn.textContent = 'Checking…';

  await sendMessage({ type: 'CHECK_NOW' });

  // Re-fetch state after a short delay (scraping may take a moment)
  await sleep(2500);
  const state = await sendMessage({ type: 'GET_STATE' });
  renderCount(state.lastCount);
  renderLastChecked(state.lastChecked);

  btn.disabled = false;
  btn.textContent = 'Check Now';
});

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Refresh last-checked time every 5s while popup is open
setInterval(async () => {
  const { lastChecked } = await chrome.storage.local.get('lastChecked');
  renderLastChecked(lastChecked);
}, 5000);

init();
