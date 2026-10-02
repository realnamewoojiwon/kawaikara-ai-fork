const { app, ipcMain, shell } = require('electron');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const api = require('./definitions/api.js').KAWAI_API_LITERAL;

const localPages = new Set(['main','error','sidebar','preference','redirect','bgtaskview'].map(name => path.join(__dirname, 'pages', name + '.html').toLowerCase()));
const channels = new Set(Object.values(api).flatMap(group => Object.values(group)));
const remoteOrigins = new Set(require('./pages/services.json').map(site => new URL(site.url).origin));
remoteOrigins.add('https://youtube.com'); remoteOrigins.add('https://netflix.com');
function state() { return require('./data/context.js').global_object; }
function mainFrame(event) { return !!event.senderFrame && event.senderFrame === event.sender.mainFrame; }
function local(event) {
  if (!mainFrame(event)) return false;
  try { return localPages.has(fileURLToPath(event.senderFrame.url).toLowerCase()); }
  catch { return false; }
}
function remote(event) {
  if (!mainFrame(event) || event.sender !== state().mainWindow?.webContents) return false;
  return remoteOrigins.has(event.senderFrame.origin);
}
function loginTag(event) {
  if (!mainFrame(event) || event.sender !== state().mainWindow?.webContents) return null;
  const origin = event.senderFrame.origin;
  const current = state().context?.current_site_descriptor?.id;
  if (current === 'netflix' && origin === 'https://www.netflix.com') return 'netflix:login';
  if (current === 'coupangplay' && origin === 'https://www.coupangplay.com') return 'coupang:login';
  return null;
}
function allowed(channel, event, args) {
  if (local(event)) return true;
  if (channel === api.input.keydown || channel === api.input.keyup) {
    const value = args[0];
    return remote(event) && value && typeof value.key === 'string' && value.key.length < 64 && typeof value.code === 'string' && value.code.length < 64 &&
      ['altKey','ctrlKey','metaKey','shiftKey'].every(key => typeof value[key] === 'boolean');
  }
  return channel === api.custom.custom_callback && args.length === 1 && args[0] === loginTag(event) && args[0] !== null;
}
const originalHandle = ipcMain.handle.bind(ipcMain);
const originalOn = ipcMain.on.bind(ipcMain);
const originalRemove = ipcMain.removeListener.bind(ipcMain);
const listeners = new WeakMap();
ipcMain.handle = function(channel, listener) {
  if (!channels.has(channel)) return originalHandle(channel, listener);
  return originalHandle(channel, (event, ...args) => {
    if (!allowed(channel, event, args)) throw new Error('This page is not authorized to control the application');
    return listener(event, ...args);
  });
};
ipcMain.on = function(channel, listener) {
  if (!channels.has(channel)) return originalOn(channel, listener);
  let map = listeners.get(listener);
  if (!map) { map = new Map(); listeners.set(listener, map); }
  let wrapper = map.get(channel);
  if (!wrapper) { wrapper = (event, ...args) => { if (allowed(channel, event, args)) return listener(event, ...args); }; map.set(channel, wrapper); }
  return originalOn(channel, wrapper);
};
ipcMain.removeListener = function(channel, listener) { return originalRemove(channel, listeners.get(listener)?.get(channel) || listener); };
originalOn('ai:preload-policy', event => {
  event.returnValue = { local: local(event), login: loginTag(event) };
});
function safeExternal(url) {
  if (typeof url !== 'string') return false;
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; }
  catch { return false; }
}
const originalExternal = shell.openExternal.bind(shell);
shell.openExternal = (url, options) => {
  if (!safeExternal(url)) return Promise.reject(new Error('Only HTTPS links may be opened externally'));
  return originalExternal(url, options);
};
module.exports = { local, allowed, loginTag, safeExternal };
