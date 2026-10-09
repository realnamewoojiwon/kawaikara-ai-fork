import { app, components, BrowserWindow, dialog } from 'electron';

import { initialize } from './logics/app_logic';
import { get_flogger, log } from './logging/logger';
const flog = get_flogger('AppLogger', 'App', 'debug');

if (process.env.IS_DEV) {
    flog.debug('app debug mode...');
    app.commandLine.appendSwitch('remote-debugging-port', '9223');
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
    const splash = new BrowserWindow({
        width: 560, height: 260, resizable: false,
        title: 'Kawaikara AI fork 시작 중',
        icon: require('node:path').join(process.resourcesPath, 'icons', 'kawaikara.ico'),
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    splash.setMenu(null);
    await splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
        '<!doctype html><html lang="ko"><meta charset="utf-8"><body style="font-family:Malgun Gothic,sans-serif;background:#f4f5fb;color:#20243a;padding:30px"><h1>Kawaikara AI fork</h1><p>프로그램을 준비하고 있습니다.</p><p>처음 실행할 때 영상 재생에 필요한 구성 요소를 받습니다.<br>인터넷 상태에 따라 잠시 걸릴 수 있습니다.</p></body></html>',
    ));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        log.info('Video components initializing');
        const ready = components.whenReady().then(() => true).catch(error => {
            log.warn('Video component initialization failed', error);
            return false;
        });
        const timedOut = new Promise<boolean>(resolve => {
            timer = setTimeout(() => resolve(false), 20000);
        });
        const available = await Promise.race([ready, timedOut]);
        if (timer) clearTimeout(timer);
        log.info('Video component readiness:', available, components.status());
        await require('./bootstrap.cjs').extensionManager.initialize();
        await initialize();
        if (!splash.isDestroyed()) splash.destroy();
        log.info('Kawaikara AI fork application initialized');
    } catch (error) {
        if (timer) clearTimeout(timer);
        log.error('Application startup failed', error);
        dialog.showErrorBox('시작할 수 없습니다', '프로그램을 시작하는 중 오류가 발생했습니다. 프로그램 폴더의 data/logs 기록을 확인해 주세요.\n\n' + String(error));
        app.quit();
    }
});
