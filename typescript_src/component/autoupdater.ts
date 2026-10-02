import { BrowserWindow, dialog } from 'electron';

// This personal portable build must not be replaced by the upstream installer.
export function setup_pogress_bar(_window: BrowserWindow) {}
export function unset_autoupdater() {}
export function set_autoupdater() {}
export function checkForUpdates() {
    return dialog.showMessageBox({
        type: 'info', title: '개인용 수정본',
        message: '개인용 수정본은 자동으로 덮어쓰지 않습니다.',
        detail: '업데이트가 필요하면 사용 중인 수정본을 기준으로 다시 확인해 주세요.',
    });
}
