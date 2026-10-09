chrome.storage.local.get(['optionValue', 'visits', 'workerSeen'], data => {
  document.querySelector('#option').value = data.optionValue || 'probe-setting';
  document.querySelector('#status').textContent = JSON.stringify(data, null, 2);
  document.documentElement.dataset.kawaikaraOptionsProbe = chrome.runtime.lastError ? 'failed' : 'ok';
});
document.querySelector('#save').addEventListener('click', () => {
  chrome.storage.local.set({ optionValue: document.querySelector('#option').value }, () => {
    document.querySelector('#status').textContent = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Saved';
  });
});
