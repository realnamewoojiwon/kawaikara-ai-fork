document.documentElement.dataset.kawaikaraExtensionProbe = 'pending';
chrome.runtime.sendMessage({ kind: 'kawaikara-probe', context: 'content' }, response => {
  const error = chrome.runtime.lastError;
  const result = error ? { ok: false, error: error.message } : response;
  document.documentElement.dataset.kawaikaraExtensionProbe = result && result.ok ? 'ok' : 'failed';
  document.documentElement.dataset.kawaikaraExtensionResult = JSON.stringify(result || { ok: false, error: 'No worker response' });
  const badge = document.createElement('div');
  badge.id = 'kawaikara-extension-probe';
  badge.textContent = result && result.ok ? 'Kawaikara MV3 probe: OK (' + result.visits + ')' : 'Kawaikara MV3 probe: FAILED';
  badge.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#173d2a;color:white;padding:12px;border-radius:8px;font:14px sans-serif';
  document.body.appendChild(badge);
});
