chrome.runtime.sendMessage({ kind: 'kawaikara-network-probe' }, ready => {
  document.documentElement.dataset.kawaikaraNetworkDetails = JSON.stringify(ready || { error: chrome.runtime.lastError?.message || 'No background response' });
  if (!ready || ready.registrationError) {
    document.documentElement.dataset.kawaikaraNetworkProbe = 'background-unavailable';
    return;
  }
  fetch('https://example.com/kawaikara-network-probe?time=' + Date.now()).then(
    () => { document.documentElement.dataset.kawaikaraNetworkProbe = 'not-blocked'; },
    () => {
      chrome.runtime.sendMessage({ kind: 'kawaikara-network-probe' }, result => {
        document.documentElement.dataset.kawaikaraNetworkDetails = JSON.stringify(result || {});
        document.documentElement.dataset.kawaikaraNetworkProbe = result && result.blocked > 0 ? 'blocked-by-extension' : 'network-error';
      });
    }
  );
});
