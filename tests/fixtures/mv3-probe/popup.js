chrome.runtime.sendMessage({ kind: 'kawaikara-probe', context: 'popup' }, response => {
  const error = chrome.runtime.lastError;
  const result = error ? { ok: false, error: error.message } : response;
  document.querySelector('#status').textContent = JSON.stringify(result || { ok: false, error: 'No worker response' }, null, 2);
  document.documentElement.dataset.kawaikaraPopupProbe = result && result.ok ? 'ok' : 'failed';
});
