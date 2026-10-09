let blocked = 0;
let registrationError = '';
try {
  chrome.webRequest.onBeforeRequest.addListener(
    () => { blocked++; return { cancel: true }; },
    { urls: ['https://example.com/kawaikara-network-probe*'] },
    ['blocking']
  );
} catch (error) { registrationError = String(error); }
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message && message.kind === 'kawaikara-network-probe') respond({ blocked, registrationError, webRequestAPI: typeof chrome.webRequest, beforeRequestAPI: typeof chrome.webRequest?.onBeforeRequest });
});
