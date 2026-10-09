const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');
const { EventEmitter } = require('node:events');

// Installed code is always outside app.asar, inside this user's portable profile.
class ExtensionManager extends EventEmitter {
  constructor(dataDir, getMainWindow) {
    super();
    this.root = path.join(dataDir, 'extensions');
    this.packages = path.join(this.root, 'packages');
    this.registryFile = path.join(this.root, 'installed.json');
    this.getMainWindow = getMainWindow;
    this.records = [];
    this.errors = new Map();
    this.childWindows = new Map();
    this.queue = Promise.resolve();
    this.pageFile = path.join(__dirname, 'pages', 'extensions.html');
    this.managerWindow = null;
    ipcMain.handle('extensions:manage', (event, operation, id, value) => {
      if (!this.isManager(event)) throw new Error('확장 관리 화면에서만 사용할 수 있습니다.');
      if (operation === 'list') return this.list();
      return this.serialize(async () => {
        if (operation === 'install') return this.chooseAndInstall();
        if (operation === 'enable' && typeof value === 'boolean') return this.setEnabled(id, value);
        if (operation === 'reload') return this.reload(id);
        if (operation === 'remove') return this.confirmRemove(id);
        if (operation === 'popup' || operation === 'options') return this.openPage(id, operation);
        throw new Error('알 수 없는 확장 작업입니다.');
      });
    });
  }
  isManager(event) {
    if (!this.managerWindow || this.managerWindow.isDestroyed()) return false;
    if (event.sender !== this.managerWindow.webContents || event.senderFrame !== event.sender.mainFrame) return false;
    try { return fileURLToPath(event.senderFrame.url).toLowerCase() === this.pageFile.toLowerCase(); }
    catch { return false; }
  }
  serialize(operation) {
    const task = this.queue.then(operation);
    this.queue = task.catch(() => {});
    return task;
  }
  async initialize() {
    this.browserSession = session.defaultSession;
    this.api = this.browserSession.extensions;
    fs.mkdirSync(this.packages, { recursive: true });
    for (const directory of [this.root, this.packages]) {
      if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('확장 저장 폴더는 연결된 폴더를 사용할 수 없습니다.');
    }
    if (fs.existsSync(this.registryFile)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.registryFile, 'utf8'));
        if (!Array.isArray(saved) || saved.length > 100) throw new Error('Invalid extension registry');
        const used = new Set();
        this.records = saved.filter(record => {
          if (!record || !/^[a-f0-9]{32}$/.test(record.token) || used.has(record.token)) return false;
          used.add(record.token); return true;
        }).map(record => ({ token: record.token, enabled: record.enabled === true, id: String(record.id || ''), fingerprint: typeof record.fingerprint === 'string' ? record.fingerprint : '', name: String(record.name || '확장 프로그램').slice(0, 200), version: String(record.version || '') }));
      } catch {
        this.registryError = '확장 목록 파일을 읽을 수 없습니다. data/extensions/installed.json을 확인해 주세요.';
      }
    }
    for (const record of this.records) if (record.enabled) await this.load(record);
    this.changed();
  }
  packagePath(record) {
    if (!/^[a-f0-9]{32}$/.test(record.token)) throw new Error('잘못된 확장 저장 경로입니다.');
    const target = path.resolve(this.packages, record.token);
    if (path.dirname(target) !== path.resolve(this.packages)) throw new Error('잘못된 확장 저장 경로입니다.');
    for (const directory of [this.root, this.packages]) if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('확장 저장 폴더는 연결된 폴더를 사용할 수 없습니다.');
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('연결된 확장 폴더는 사용할 수 없습니다.');
    if (fs.existsSync(target)) {
      const actual = fs.realpathSync(target).toLowerCase(), parent = fs.realpathSync(this.packages).toLowerCase();
      if (path.dirname(actual) !== parent) throw new Error('확장 저장 범위를 벗어난 경로입니다.');
    }
    return target;
  }
  save() {
    if (this.registryError) throw new Error(this.registryError);
    const temp = this.registryFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.records, null, 2));
    fs.renameSync(temp, this.registryFile);
  }
  changed() {
    this.emit('changed');
    if (this.managerWindow && !this.managerWindow.isDestroyed()) this.managerWindow.webContents.send('extensions:changed');
  }
  find(token) {
    const record = this.records.find(item => item.token === token);
    if (!record) throw new Error('설치된 확장을 찾을 수 없습니다.');
    return record;
  }
  manifest(record) { return this.readManifest(this.packagePath(record)); }
  readManifest(folder) {
    const file = path.join(folder, 'manifest.json');
    if (!fs.existsSync(file) || fs.statSync(file).size > 1024 * 1024) throw new Error('manifest.json이 있는 확장 폴더를 선택해 주세요.');
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error('manifest.json 형식이 올바르지 않습니다.'); }
    if (![2, 3].includes(manifest.manifest_version) || typeof manifest.name !== 'string' || typeof manifest.version !== 'string') throw new Error('이 폴더에는 올바른 Chrome 확장 정보가 없습니다.');
    return manifest;
  }
  warnings(manifest) {
    const supported = new Set(['storage', 'tabs', 'activeTab', 'scripting', 'webRequest', 'webRequestBlocking', '<all_urls>']);
    const unknown = (Array.isArray(manifest.permissions) ? manifest.permissions : []).filter(p => typeof p === 'string' && !supported.has(p) && !p.includes('://'));
    const warnings = [];
    if (unknown.length) warnings.push('지원 여부를 확인해야 하는 권한: ' + unknown.join(', '));
    if (manifest.background?.service_worker) warnings.push('백그라운드 서비스 워커를 사용하는 확장입니다. 확장별 호환성 확인이 필요합니다.');
    if (Array.isArray(manifest.permissions) && manifest.permissions.includes('activeTab')) warnings.push('확장 버튼 클릭으로 현재 페이지 권한을 받는 기능은 완전히 지원하지 않습니다.');
    if (Array.isArray(manifest.permissions) && manifest.permissions.includes('webRequest')) warnings.push('쿠팡플레이를 선택한 동안에는 네트워크 차단·요청 변경 기능이 앱과 충돌할 수 있습니다. 다른 서비스로 전환하면 해제됩니다.');
    if ((manifest.action || manifest.browser_action) && !(manifest.action?.default_popup || manifest.browser_action?.default_popup)) warnings.push('클릭 동작 전용 확장 버튼은 지원하지 않습니다.');
    return warnings;
  }
  list() {
    return { registryError: this.registryError || null, items: this.records.map(record => {
      let manifest = {};
      try { manifest = this.manifest(record); } catch {}
      const loaded = !!record.id && !!this.api.getExtension(record.id);
      return { token: record.token, name: record.name, version: record.version, enabled: record.enabled, loaded,
        error: this.errors.get(record.token) || null, warnings: this.warnings(manifest),
        permissions: [...(Array.isArray(manifest.permissions) ? manifest.permissions : []), ...(Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [])].filter(p => typeof p === 'string'),
        popup: loaded && !!(manifest.action?.default_popup || manifest.browser_action?.default_popup || manifest.page_action?.default_popup),
        options: loaded && !!(manifest.options_ui?.page || manifest.options_page) };
    }) };
  }
  async load(record) {
    try {
      const extension = await this.api.loadExtension(this.packagePath(record), { allowFileAccess: false });
      record.id = extension.id; record.name = extension.name; record.version = extension.version;
      this.errors.delete(record.token);
      return true;
    } catch (error) {
      // Native messages can contain personal filesystem paths; never display or package them.
      this.errors.set(record.token, '불러오지 못했습니다. 확장 파일과 Electron 호환성을 확인해 주세요.');
      return false;
    }
  }
  async chooseAndInstall() {
    if (this.registryError) throw new Error(this.registryError);
    const choice = await dialog.showOpenDialog(this.managerWindow, { title: 'manifest.json이 들어 있는 확장 폴더 선택', properties: ['openDirectory'] });
    if (choice.canceled) return { canceled: true };
    const folder = choice.filePaths[0], manifest = this.readManifest(folder);
    const permissions = [...(Array.isArray(manifest.permissions) ? manifest.permissions : []), ...(Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [])].filter(p => typeof p === 'string');
    const answer = await dialog.showMessageBox(this.managerWindow, { type: 'question', title: '확장 프로그램 추가',
      message: String(manifest.name).slice(0, 200) + ' 확장을 추가할까요?',
      detail: '이 확장은 허용된 사이트의 화면과 데이터에 접근할 수 있습니다. 신뢰하는 확장만 추가하세요.\n\n요청 권한: ' + (permissions.join(', ') || '없음') + '\n\n' + this.warnings(manifest).join('\n'),
      buttons: ['취소', '추가'], defaultId: 0, cancelId: 0, noLink: true });
    if (answer.response !== 1) return { canceled: true };
    return this.installFolder(folder);
  }
  async installFolder(folder) {
    if (this.registryError) throw new Error(this.registryError);
    if (this.records.length >= 100) throw new Error('확장은 최대 100개까지 추가할 수 있습니다.');
    const manifest = this.readManifest(folder);
    const source = fs.realpathSync(folder);
    const managerRoot = fs.realpathSync(this.root).toLowerCase(), comparableSource = source.toLowerCase();
    const inside = (parent, child) => { const relative = path.relative(parent, child); return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)); };
    if (inside(comparableSource, managerRoot) || inside(managerRoot, comparableSource)) throw new Error('프로그램 데이터 폴더를 확장으로 추가할 수 없습니다.');
    // Never ask Electron to load an already installed key: it can replace the live extension.
    if (manifest.key && this.records.some(other => { try { return this.manifest(other).key === manifest.key; } catch { return false; } })) throw new Error('같은 확장이 이미 설치되어 있습니다.');
    const record = { token: crypto.randomBytes(16).toString('hex'), enabled: true, id: '', name: manifest.name.slice(0, 200), version: manifest.version };
    const destination = this.packagePath(record);
    let count = 0, bytes = 0;
    const fingerprint = crypto.createHash('sha256');
    const copy = (from, to) => {
      const stat = fs.lstatSync(from);
      if (stat.isSymbolicLink()) throw new Error('바로가기나 연결된 폴더가 포함된 확장은 추가할 수 없습니다.');
      if (stat.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        for (const entry of fs.readdirSync(from).sort()) {
          if (entry === '.git') continue;
          copy(path.join(from, entry), path.join(to, entry));
        }
      } else if (stat.isFile()) {
        bytes += stat.size;
        if (++count > 15000 || bytes > 200 * 1024 * 1024) throw new Error('확장 폴더가 너무 큽니다. 최대 200MB, 15,000개 파일까지 지원합니다.');
        const relative = path.relative(source, from).replaceAll('\\', '/');
        fingerprint.update(relative + '\0' + stat.size + '\0');
        fingerprint.update(fs.readFileSync(from));
        fs.copyFileSync(from, to);
      } else throw new Error('일반 파일이 아닌 항목이 포함돼 있습니다.');
    };
    try {
      copy(source, destination);
      record.fingerprint = fingerprint.digest('hex');
      if (this.records.some(other => other.fingerprint === record.fingerprint)) throw new Error('같은 확장이 이미 설치되어 있습니다.');
      // Preserve ID/storage when a portable app is moved to a different directory.
      if (!manifest.key) {
        manifest.key = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
      }
      if (!await this.load(record)) throw new Error(this.errors.get(record.token));
      if (this.records.some(other => other.id === record.id)) throw new Error('같은 확장이 이미 설치되어 있습니다.');
      this.records.push(record);
      try { this.save(); } catch (error) { this.records.pop(); throw error; }
    } catch (error) {
      // Do not unload an existing duplicate that shares the extension ID.
      if (record.id && !this.records.some(other => other.id === record.id)) this.api.removeExtension(record.id);
      if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
      this.errors.delete(record.token);
      throw error;
    }
    this.changed(); return { added: true };
  }
  closePages(record) {
    for (const [key, window] of this.childWindows) if (key.startsWith(record.token + ':')) {
      if (!window.isDestroyed()) window.destroy();
      this.childWindows.delete(key);
    }
  }
  async setEnabled(token, enabled) {
    const record = this.find(token), previous = record.enabled;
    record.enabled = enabled;
    try { this.save(); } catch (error) { record.enabled = previous; throw error; }
    this.closePages(record);
    if (enabled) await this.load(record);
    else { if (record.id) this.api.removeExtension(record.id); this.errors.delete(token); }
    this.changed(); return { refreshPage: true };
  }
  async reload(token) {
    const record = this.find(token);
    if (!record.enabled) throw new Error('꺼진 확장을 먼저 켜 주세요.');
    this.closePages(record);
    if (record.id) this.api.removeExtension(record.id);
    await this.load(record); this.save(); this.changed(); return { refreshPage: true };
  }
  async confirmRemove(token) {
    const record = this.find(token);
    const answer = await dialog.showMessageBox(this.managerWindow, { type: 'question', message: record.name + ' 확장을 삭제할까요?',
      detail: '앱이 복사해 둔 확장 파일만 삭제합니다. 처음 선택한 원본 폴더는 유지됩니다.', buttons: ['취소', '삭제'], defaultId: 0, cancelId: 0, noLink: true });
    if (answer.response !== 1) return { canceled: true };
    return this.remove(token);
  }
  remove(token) {
    const record = this.find(token), previous = [...this.records];
    const destination = this.packagePath(record);
    this.records = this.records.filter(item => item !== record);
    try { this.save(); } catch (error) { this.records = previous; throw error; }
    this.closePages(record);
    if (record.id) this.api.removeExtension(record.id);
    // Only the validated random-token subdirectory is deleted.
    fs.rmSync(destination, { recursive: true, force: true });
    this.errors.delete(token); this.changed(); return { refreshPage: true };
  }
  pageURL(record, relative) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.startsWith('/') || relative.includes(':')) throw new Error('확장 화면의 주소가 올바르지 않습니다.');
    const base = 'chrome-extension://' + record.id + '/';
    const url = new URL(relative, base);
    if (url.hostname !== record.id || url.protocol !== 'chrome-extension:' || url.username || url.password) throw new Error('확장 외부의 화면은 열 수 없습니다.');
    const pathname = decodeURIComponent(url.pathname).slice(1);
    const file = path.resolve(this.packagePath(record), pathname);
    if (!file.startsWith(this.packagePath(record) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('확장 화면 파일을 찾을 수 없습니다.');
    return url.href;
  }
  async openPage(token, kind) {
    const record = this.find(token);
    if (!record.enabled || !this.api.getExtension(record.id)) throw new Error('실행 중인 확장만 열 수 있습니다.');
    const manifest = this.manifest(record);
    const relative = kind === 'popup' ? (manifest.action?.default_popup || manifest.browser_action?.default_popup || manifest.page_action?.default_popup) : (manifest.options_ui?.page || manifest.options_page);
    const url = this.pageURL(record, relative);
    const key = token + ':' + kind, existing = this.childWindows.get(key);
    if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return { opened: true }; }
    const popup = kind === 'popup';
    const window = new BrowserWindow({ width: popup ? 440 : 820, height: popup ? 580 : 640, parent: this.getMainWindow(),
      title: record.name, autoHideMenuBar: true, icon: path.join(process.resourcesPath, 'icons', 'kawaikara.ico'),
      webPreferences: { session: this.browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    window.setMenu(null); this.childWindows.set(key, window);
    window.on('closed', () => this.childWindows.delete(key));
    window.webContents.setWindowOpenHandler(details => { this.openExternal(details.url); return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, next) => { if (!next.startsWith('chrome-extension://' + record.id + '/')) { event.preventDefault(); this.openExternal(next); } });
    try { await window.loadURL(url); } catch { window.destroy(); throw new Error('확장 화면을 열지 못했습니다.'); }
    return { opened: true };
  }
  openExternal(url) {
    if (require('./security.cjs').safeExternal(url)) void shell.openExternal(url).catch(() => {});
  }
  async openManager() {
    if (this.managerWindow && !this.managerWindow.isDestroyed()) { this.managerWindow.show(); this.managerWindow.focus(); return; }
    const window = new BrowserWindow({ width: 900, height: 720, minWidth: 620, minHeight: 450, parent: this.getMainWindow(),
      title: '확장 프로그램 관리 — Kawaikara AI fork', icon: path.join(process.resourcesPath, 'icons', 'kawaikara.ico'),
      webPreferences: { partition: 'persist:extension-management', preload: path.join(__dirname, 'extensions-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    this.managerWindow = window; window.setMenu(null);
    window.on('closed', () => { this.managerWindow = null; });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    await window.loadFile(this.pageFile);
  }
}
module.exports = { ExtensionManager };
