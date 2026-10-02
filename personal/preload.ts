// One self-contained preload for sandboxed windows. Only Electron is required.
const { contextBridge, ipcRenderer } = require('electron');
const policy = ipcRenderer.sendSync('ai:preload-policy') || {};
const invoke = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const send = (channel: string) => (...args: unknown[]) => ipcRenderer.send(channel, ...args);
const listen = (channel: string) => (callback: (...args: unknown[]) => void) => ipcRenderer.on(channel, (_event: unknown, ...args: unknown[]) => callback(...args));
if (policy.local) {
  contextBridge.exposeInMainWorld('KAWAI_PERSONAL', {
    status: invoke('personal:status'), action: invoke('personal:action'),
  });
  contextBridge.exposeInMainWorld('KAWAI_API', {
    preference: {
      apply_modified_preference: invoke('apply-changed-preference'), close: send('close'),
      save_and_close: async (config: unknown) => { await ipcRenderer.invoke('apply-changed-preference', config); ipcRenderer.send('close'); },
      load_config: invoke('load-config'), load_locale: invoke('load-locale'),
      load_available_site_list: invoke('load-available-site-list'), notify_config_update: listen('notify-config-update'),
      load_available_locale_list: invoke('load-available-locale-list'), load_available_monitor_list: invoke('load-available-monitor-list'),
      load_available_window_size_list: invoke('load-available-window-size-list'), load_available_pip_window_size_list: invoke('load-available-pip-window-size-list'),
      load_available_pip_location_list: invoke('load-available-pip-location-list'),
    },
    menu: {
      add_favorites: invoke('add-favorites'), load_favorites_list: invoke('load-favorites-list'), delete_favorites: invoke('delete-favorites'),
      update_favorites_order: invoke('update-fovorites-order'), load_menu: invoke('load-menu'), select_menu_item: invoke('select-menu-item'),
      notify_menu_update: listen('notify-menu-update'), close: send('menu-close'), on_notify_menu_status: listen('notify-menu-open'),
    },
    etc: {load_update_info: invoke('load-update-info'), version: invoke('version')},
    custom: {custom_callback: send('custom-callback'), custom_invoke: invoke('custom-callback'),
      custom_callback_recv: (name: string, callback: (...args: unknown[]) => void) => ipcRenderer.on('custom-callback', (_event: unknown, tag: string, ...args: unknown[]) => {if (tag === name) callback(...args);})},
  });
} else if (policy.login) {
  const tag = policy.login;
  contextBridge.exposeInMainWorld('KAWAI_API', {custom: {custom_callback: (name: string) => {if (name === tag) ipcRenderer.send('custom-callback', tag);}}});
}
// Only real keyboard input is forwarded. Tab retains the webpage's normal focus behavior.
for (const type of ['keydown','keyup']) window.addEventListener(type, (event: KeyboardEvent) => {
  if (!event.isTrusted || event.key === 'Tab' || event.key === 'F11' || (event.altKey && event.key === 'Enter')) return;
  if (!policy.local && !policy.login && window.location.protocol !== 'https:') return;
  if (event.ctrlKey && event.key.toLowerCase() === 'p') event.preventDefault();
  const value = {key:event.key,code:event.code,altKey:event.altKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey};
  ipcRenderer.invoke(type, value).catch(() => {});
});
