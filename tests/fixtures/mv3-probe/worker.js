chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (!message || message.kind !== 'kawaikara-probe') return false;
  chrome.storage.local.get(['visits', 'optionValue'], data => {
    if (chrome.runtime.lastError) {
      respond({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    const visits = Number(data.visits || 0) + (message.context === 'content' ? 1 : 0);
    chrome.storage.local.set({ visits, workerSeen: true }, () => {
      if (chrome.runtime.lastError) respond({ ok: false, error: chrome.runtime.lastError.message });
      else respond({ ok: true, source: 'service-worker', visits, optionValue: data.optionValue || '', extensionId: chrome.runtime.id });
    });
  });
  return true;
});
