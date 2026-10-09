const { app, BrowserWindow, Menu, ipcMain, shell, components } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const dataDir = process.env.KAWAIKARA_DATA_DIR ||
  (app.commandLine.hasSwitch('user-data-dir') ? app.getPath('userData') : path.join(path.dirname(process.execPath), 'data'));
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);
app.setPath('sessionData', dataDir);
app.setName('Kawaikara AI fork');
app.setAppUserModelId('day.faby.kawaikara.ai-fork');
app.enableSandbox();
require('./security.cjs');

const localPages = path.resolve(__dirname, 'pages');
const trustedPages = new Set(['main.html', 'error.html'].map(f => path.join(localPages, f).toLowerCase()));
const services = require('./pages/services.json');
function trusted(event) {
  try { return require('./security.cjs').local(event) && trustedPages.has(fileURLToPath(event.senderFrame.url).toLowerCase()); }
  catch { return false; }
}
function managers() {
  return {
    view: require('./manager/view_manager.js').KawaiViewManager.getInstance(),
    state: require('./data/context.js').global_object,
    log: require('./logging/logger.js').log,
  };
}
let mainWindow;
const extensionManager = new (require('./extensions.cjs').ExtensionManager)(dataDir, () => mainWindow);
let failedURL;
const installedWindows = new WeakSet();

ipcMain.handle('personal:status', event => {
  if (!trusted(event)) throw new Error('This action is only available on the local start page');
  return { components: components.status(), version: app.getVersion() };
});
ipcMain.handle('personal:action', async (event, action, id) => {
  if (!trusted(event)) throw new Error('This action is only available on the local start page');
  if (action === 'browser') {
    const site = services.find(s => s.id === id);
    if (!site) throw new Error('Unknown service');
    await shell.openExternal(site.url);
  } else if (action === 'extensions') await extensionManager.openManager();
  else if (action === 'menu') managers().view.openMenu();
  else if (action === 'home') await managers().view.loadUrl('main');
  else if (action === 'retry' && failedURL && mainWindow) await mainWindow.loadURL(failedURL);
  else if (action === 'browser-current') await openCurrentInBrowser();
  else throw new Error('Unknown action');
});
async function openCurrentInBrowser() {
  const current = mainWindow?.webContents.getURL();
  const url = current?.startsWith('https://') ? current : failedURL;
  if (url?.startsWith('https://')) await shell.openExternal(url);
}
function installMainWindow(window) {
  if (installedWindows.has(window)) return;
  installedWindows.add(window);
  mainWindow = window;
  window.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && !input.control && !input.alt && !input.meta) {
      event.preventDefault();
      if (input.type === 'keyDown' && !input.isAutoRepeat) managers().view.fullscreen();
    }
  });
  const originalLoadURL = window.loadURL.bind(window);
  window.loadURL = (...args) => originalLoadURL(...args).catch(error => {
    managers().log.warn('Page navigation failed:', error.code || error.message);
  });
  window.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !url.startsWith('https://')) return;
    failedURL = url;
    window.loadFile(path.join(localPages, 'error.html'), { query: { host: new URL(url).hostname, code: String(code) } })
      .catch(error => managers().log.error('Cannot open the recovery page', error));
  });
  window.webContents.on('render-process-gone', (_event, detail) => {
    managers().log.error('Renderer stopped:', detail.reason);
    if (!window.isDestroyed()) managers().view.loadUrl('main').catch(error => managers().log.error(error));
  });
  const refreshMenu = () => {
    if (window.isDestroyed()) return;
    const choose = id => () => managers().view.loadUrl(id).catch(error => managers().log.error(error));
    const menu = Menu.buildFromTemplate([
      { label: '서비스', submenu: services.map(s => ({ label: s.name, click: choose(s.id) })) },
      { label: '보기', submenu: [
        { label: '시작 화면', accelerator: 'Ctrl+Home', click: choose('main') },
        { label: '서비스 메뉴', click: () => managers().view.openMenu() },
        { label: '새로고침', role: 'reload' },
        { label: '작은 창으로 보기 (PiP)', click: () => managers().view.pipMode() },
        { label: '전체화면', accelerator: 'F11', click: () => managers().view.fullscreen() },
        { label: '항상 위에 표시', click: () => managers().view.alwaysOnTopMode() },
      ] },
      { label: '확장 프로그램', submenu: [
        { label: '확장 프로그램 관리…', click: () => extensionManager.openManager().catch(error => managers().log.error(error)) },
        ...extensionManager.list().items.filter(item => item.loaded && item.popup).map(item => ({
          label: item.name, click: () => extensionManager.openPage(item.token, 'popup').catch(error => managers().log.error(error)),
        })),
      ] },
      { label: '도움', submenu: [
        { label: '현재 서비스를 기본 브라우저에서 열기', click: () => openCurrentInBrowser().catch(error => managers().log.error(error)) },
        { label: '프로그램 종료', role: 'quit' },
      ] },
    ]);
    window.setMenu(menu);
    window.setMenuBarVisibility(true);
    window.setAutoHideMenuBar(false);
    window.setTitle('Kawaikara AI fork');
  };
  window.webContents.once('did-finish-load', refreshMenu);
  extensionManager.on('changed', refreshMenu);
  window.once('closed', () => extensionManager.removeListener('changed', refreshMenu));
}
module.exports = { installMainWindow, extensionManager };
app.on('second-instance', () => {
  const window = mainWindow || BrowserWindow.getAllWindows()[0];
  if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
});
if (!app.requestSingleInstanceLock()) app.quit();
else require('./electron.js');
