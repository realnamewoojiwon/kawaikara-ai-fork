const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const fixture = path.join(__dirname, 'fixtures', 'mv3-probe');
const invalidFixture = path.join(__dirname, 'fixtures', 'invalid-manifest');
const networkFixture = path.join(__dirname, 'fixtures', 'webrequest-probe');
const profile = path.join(root, 'build', 'extension-test-' + Date.now());
const executablePath = path.join(root, 'dist', 'Kawaikara AI fork', 'electron.exe');
const report = { checkedAt: new Date().toISOString(), checks: [], version: '2.3.1-ai.3', paidPlaybackAttempted: false };
const reportFile = path.join(root, 'build', 'extension-test-report.json');
let application, page, managerPage, token, extensionId, currentProfile = profile;
const pass = name => { report.checks.push({ name, status: 'PASS' }); console.log('PASS', name); };
async function main(operation, arg) {
  return application.evaluate(async ({ app, BrowserWindow, dialog, session }, { operation, arg }) => {
    const req = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const manager = req('./public/bootstrap.cjs').extensionManager;
    if (operation === 'state') return manager.list();
    if (operation === 'windows') return BrowserWindow.getAllWindows().map(window => ({ id: window.id, url: window.webContents.getURL(), preferences: window.webContents.getLastWebPreferences() }));
    if (operation === 'dialogs') {
      globalThis.extensionTestDialogs = [];
      dialog.showOpenDialog = async () => { globalThis.extensionTestDialogs.push('folder'); return { canceled: false, filePaths: [arg] }; };
      dialog.showMessageBox = async (_window, options) => { globalThis.extensionTestDialogs.push(options.message); return { response: 1 }; };
    }
    if (operation === 'home') return req('./public/manager/view_manager.js').KawaiViewManager.getInstance().loadUrl('main');
    if (operation === 'mode') { const window = req('./public/data/context.js').global_object.mainWindow; return { fullscreen: window.isFullScreen(), bounds: window.getBounds(), menu: req('./public/manager/view_manager.js').KawaiViewManager.getInstance().isMenuOpen() }; }
    if (operation === 'key') { const wc = req('./public/data/context.js').global_object.mainWindow.webContents; wc.sendInputEvent({ type: 'keyDown', keyCode: arg.key, modifiers: arg.modifiers || [] }); wc.sendInputEvent({ type: 'keyUp', keyCode: arg.key, modifiers: arg.modifiers || [] }); }
    if (operation === 'gates') {
      const wc = manager.managerWindow.webContents, remote = req('./public/data/context.js').global_object.mainWindow.webContents;
      return { managerAllowed: manager.isManager({ sender: wc, senderFrame: wc.mainFrame }),
        otherWindowDenied: !manager.isManager({ sender: remote, senderFrame: remote.mainFrame }),
        iframeDenied: !manager.isManager({ sender: wc, senderFrame: { url: wc.mainFrame.url } }),
        forgedSenderDenied: !manager.isManager({ sender: { mainFrame: wc.mainFrame }, senderFrame: wc.mainFrame }),
        managementSessionIsolated: wc.session !== session.defaultSession };
    }
    if (operation === 'paths') {
      const record = manager.find(arg);
      const attacks = ['https://example.com/', '/popup.html', '..\\popup.html', '//other/popup.html', '\n//other/popup.html', '%2e%2e/%2e%2e/outside.html', '%2f%2foutside'];
      return attacks.every(value => { try { manager.pageURL(record, value); return false; } catch { return true; } });
    }
    if (operation === 'dialogs-seen') return globalThis.extensionTestDialogs;
    if (operation === 'loaded') return session.defaultSession.extensions.getAllExtensions().length;
  }, { operation, arg });
}
async function launch() {
  const env = { ...process.env, KAWAIKARA_DATA_DIR: currentProfile }; delete env.ELECTRON_RUN_AS_NODE; delete env.IS_DEV;
  application = await _electron.launch({ executablePath, env, timeout: 60000 });
  await application.firstWindow({ timeout: 45000 });
  for (let i = 0; i < 180; i++) {
    page = application.windows().find(candidate => /\/main\.html$/.test(candidate.url()));
    if (page) { await page.locator('#extensions').waitFor(); return; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Start page not found');
}
async function close() {
  if (!application) return;
  const old = application; application = null;
  let done = false;
  await Promise.race([old.close().catch(() => {}).finally(() => done = true), new Promise(resolve => setTimeout(resolve, 5000))]);
  if (!done) old.process().kill();
}
async function openManager() {
  await page.locator('#extensions').click();
  for (let i = 0; i < 40; i++) {
    managerPage = application.windows().find(candidate => /\/extensions\.html$/.test(candidate.url()));
    if (managerPage) { await managerPage.locator('#add').waitFor(); return; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Extension manager did not open');
}
async function visitProbe(expected = true) {
  await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (expected) {
    await page.waitForFunction(() => document.documentElement.dataset.kawaikaraExtensionProbe === 'ok');
    const value = await page.evaluate(() => JSON.parse(document.documentElement.dataset.kawaikaraExtensionResult));
    assert.equal(value.source, 'service-worker'); assert.equal(value.extensionId, extensionId);
    return value;
  }
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.kawaikaraExtensionProbe), undefined);
}
(async () => {
  try {
    await launch();
    assert.equal(await page.locator('[data-service]').count(), 16);
    await page.waitForFunction(() => [...document.querySelectorAll('.service-logo')].every(img => img.complete && img.naturalWidth));
    pass('Startup, 16 services and original home logos');
    const bounds = (await main('mode')).bounds;
    await main('key', { key: 'F11' }); await page.waitForTimeout(700); assert.equal((await main('mode')).fullscreen, true);
    await main('key', { key: 'F11' }); await page.waitForTimeout(700); assert.equal((await main('mode')).fullscreen, false); assert.equal((await main('mode')).bounds.width, bounds.width);
    await main('key', { key: 'Enter', modifiers: ['alt'] }); await page.waitForTimeout(200); assert.equal((await main('mode')).fullscreen, false);
    await main('key', { key: 'Tab' }); assert.equal((await main('mode')).menu, false); pass('F11, Alt+Enter removal and normal Tab');
    await openManager(); assert.equal((await main('state')).items.length, 0);
    assert.ok(Object.values(await main('gates')).every(Boolean)); pass('Extension manager IPC gates and separate session');
    await main('dialogs', fixture); await managerPage.locator('#add').click();
    await managerPage.locator('.extension').waitFor();
    const item = (await main('state')).items[0]; token = item.token; extensionId = item.id || await application.evaluate(({ session }) => session.defaultSession.extensions.getAllExtensions()[0].id);
    assert.equal(item.loaded, true); assert.equal(item.popup, true); assert.equal(item.options, true);
    assert.deepEqual((await main('dialogs-seen')).slice(0, 1), ['folder']); assert.equal((await main('dialogs-seen')).length, 2);
    assert.ok(await main('paths', token)); pass('Native folder and permission confirmation, import and path validation');
    await managerPage.screenshot({ path: path.join(root, 'build', 'extensions-manager.png'), fullPage: true });
    await visitProbe(); assert.deepEqual(await page.evaluate(() => ({ app: typeof window.KAWAI_API, extensions: typeof window.KAWAI_EXTENSIONS, node: typeof require })), { app: 'undefined', extensions: 'undefined', node: 'undefined' });
    pass('Actual MV3 page injection, worker messages, storage and remote isolation');
    await managerPage.getByRole('button', { name: '팝업 열기', exact: true }).click();
    let popup;
    for (let i = 0; i < 40; i++) { popup = application.windows().find(candidate => candidate.url().includes(extensionId + '/popup.html')); if (popup) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(popup); await popup.waitForFunction(() => document.documentElement.dataset.kawaikaraPopupProbe === 'ok');
    assert.deepEqual(await popup.evaluate(() => ({ app: typeof window.KAWAI_API, extensions: typeof window.KAWAI_EXTENSIONS, node: typeof require })), { app: 'undefined', extensions: 'undefined', node: 'undefined' });
    await managerPage.getByRole('button', { name: '설정 열기', exact: true }).click();
    let options;
    for (let i = 0; i < 40; i++) { options = application.windows().find(candidate => candidate.url().includes(extensionId + '/options.html')); if (options) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(options); await options.waitForFunction(() => document.documentElement.dataset.kawaikaraOptionsProbe === 'ok');
    const extensionWindows = (await main('windows')).filter(window => window.url.startsWith('chrome-extension:'));
    assert.ok(extensionWindows.every(window => window.preferences.sandbox && window.preferences.contextIsolation && !window.preferences.nodeIntegration && !window.preferences.preload));
    pass('Popup and options run in sandbox without application preload');
    await main('dialogs', fixture); await managerPage.locator('#add').click(); await managerPage.locator('#notice').filter({ hasText: '이미 설치' }).waitFor(); assert.equal((await main('state')).items.length, 1); await visitProbe(); pass('Duplicate import rejected before disturbing loaded extension');
    await managerPage.getByRole('checkbox').uncheck(); await managerPage.locator('.meta').filter({ hasText: '꺼짐' }).waitFor(); assert.equal(await main('loaded'), 0); await visitProbe(false);
    await managerPage.getByRole('checkbox').check(); await managerPage.locator('.meta').filter({ hasText: '실행 중' }).waitFor(); await visitProbe();
    await managerPage.getByRole('button', { name: '다시 불러오기', exact: true }).click(); await managerPage.locator('#notice').filter({ hasText: '변경했습니다' }).waitFor(); await visitProbe();
    pass('Disable, enable and reload change actual script execution after navigation');
    await main('dialogs', invalidFixture); await managerPage.locator('#add').click(); await managerPage.locator('#notice').filter({ hasText: '형식이 올바르지' }).waitFor(); assert.equal((await main('state')).items.length, 1); pass('Invalid manifest fails without altering existing extension');
    await close(); await launch(); assert.equal((await main('state')).items[0].loaded, true); await visitProbe(); pass('Enabled extensions restored before first navigation after restart');
    await close(); currentProfile = profile + '-moved'; fs.cpSync(profile, currentProfile, { recursive: true }); await launch();
    const moved = await application.evaluate(({ session }) => session.defaultSession.extensions.getAllExtensions()[0].id); assert.equal(moved, extensionId); await visitProbe(); pass('Portable profile move preserves extension ID and storage');
    await main('home'); await page.locator('#extensions').waitFor(); await openManager();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.kawaikaraExtensionProbe), undefined);
    await main('dialogs', fixture); await managerPage.getByRole('button', { name: '삭제', exact: true }).click(); await managerPage.locator('.empty').waitFor();
    assert.equal((await main('state')).items.length, 0); assert.equal(await main('loaded'), 0); assert.equal(fs.existsSync(path.join(currentProfile, 'extensions', 'packages', token)), false); assert.equal(fs.existsSync(path.join(fixture, 'manifest.json')), true);
    await visitProbe(false); pass('Remove unloads extension and deletes only the private copy');
    await main('dialogs', networkFixture); await managerPage.locator('#add').click(); await managerPage.locator('.extension').waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.kawaikaraNetworkProbe, null, { timeout: 20000 });
    const networkState = await page.evaluate(() => ({ state: document.documentElement.dataset.kawaikaraNetworkProbe, details: document.documentElement.dataset.kawaikaraNetworkDetails }));
    report.network = networkState;
    assert.equal(networkState.state, 'blocked-by-extension', JSON.stringify(networkState));
    pass('Actual chrome.webRequest extension cancels a test network request');
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.failure = error.stack; console.error(error.stack); process.exitCode = 1; }
  finally { await close(); fs.writeFileSync(reportFile, JSON.stringify(report, null, 2)); console.log('RESULT', report.result); }
})();
