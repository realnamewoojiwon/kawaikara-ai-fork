import { connect } from 'http2';
import {
    KawaiAbstractSiteDescriptor,
    KawaikaraViewAction,
} from '../definitions/SiteDescriptor';
import {
    registerKawaiSiteDescriptor,
    connectToMenu as connectToMenu,
    connectToShortcut,
} from '../logics/register';
import {
    data_root_path,
    download_root_path,
    project_root,
    script_root_path,
    third_party_bin_path,
} from '../component/constants';
import path from 'path';
import { log } from '../logging/logger';
import * as fs from 'fs/promises';
import { ipcMain, net, session, shell, dialog } from 'electron';
import { KAWAI_API_LITERAL } from '../definitions/api';
import { Domain } from 'domain';
import {
    convertPlayWrightCookieToElectron,
} from '../logics/cookies';
import { cvrt_electron_path } from '../logics/path';
import {
    closeAllExtenalBrowser,
    closeOnTargetURL,
    launchExternalBrowser,
    setExternalBrowserDataPath,
} from '../component/externalBrowser';
import { Page } from 'patchright';
import { KawaiViewManager } from '../manager/view_manager';

@connectToShortcut('goto_netflix')
@connectToMenu('menu_netflix')
@registerKawaiSiteDescriptor
export class KawaiNetflixDesc extends KawaiAbstractSiteDescriptor {
    id: string = 'netflix';
    category: string | undefined = 'ott';
    shortcut_id: string = 'goto_netflix';

    _LoginBtnInjectFn: (() => void) | null = null;
    _loadHandler: (() => void) | null = null;
    _customCallback: ((e: Electron.IpcMainEvent, tag: string) => void) | null =
        null;

    onBeforeSendHeaders(detail: Electron.OnBeforeSendHeadersListenerDetails) {}

    async _preload(view: Electron.BrowserWindow, action: KawaikaraViewAction) {
        const syncCookies = async (targetPage: Page) => {
            try {
                const cookies = await targetPage.context().cookies();
                // map보다는 for...of나 Promise.all을 써야 모든 쿠키가 세팅되는 것을 보장합니다.
                await Promise.all(
                    cookies.map(async (cookie) => {
                        const electronCookie =
                            await convertPlayWrightCookieToElectron(cookie);
                        return session.defaultSession.cookies.set(
                            electronCookie,
                        );
                    }),
                );
                console.log('Cookies synced to Electron successfully.');
            } catch (e) {
                console.error('Failed to sync cookies:', e);
            }
        };

        let html_path = cvrt_electron_path(
            path.resolve(script_root_path, './pages/redirect.html'),
        );
        view.loadURL(
            process.env.IS_DEV
                ? 'http://localhost:3000/redirect.html'
                : html_path,
        );
        const page = await launchExternalBrowser({
            persist: true,
            headless: false,
        });

        if (!page) {
            action.resume();
            await dialog.showMessageBox(view, {
                type: 'warning', title: '로그인 창을 열 수 없습니다',
                message: 'Chrome 또는 Edge를 실행할 수 없습니다.',
                detail: '메뉴의 도움 → 현재 서비스를 기본 브라우저에서 열기를 이용해 주세요.',
            });
            return;
        }

        if (page) {
            closeOnTargetURL(
                page,
                /\/(browse)/,
                async (targetPage: Page) => {
                    await syncCookies(targetPage);
                    closeAllExtenalBrowser();
                    action.resume();
                },
                async (targetPage: Page) => {
                    closeAllExtenalBrowser();
                    action.resume();
                },
            );
        }
        try {
            await page?.goto('https://www.netflix.com/login');
            console.log('external launch');
        } catch (e) {
            console.log(`goto failed, ignore exception ${e}`);
        }

        await action.wait(async () => {
            console.log('abroted!!!');
            closeAllExtenalBrowser();
        });
    }

    _attachCustomCallbacks(browser: Electron.BrowserWindow) {
        this._LoginBtnInjectFn = () => {
            console.log('inject install');
            const loginAnchor = document.querySelector(
                'a[data-uia="header-login-link"]',
            ) as HTMLAnchorElement | undefined;

            if (loginAnchor && !loginAnchor.dataset.hack) {
                /**
                 * 1. CLONE NODE TO STRIP EVENT LISTENERS
                 * We clone the element to remove all existing event listeners attached by the original site.
                 * This is more reliable than stopPropagation() as it creates a "clean slate" element.
                 */
                const newAnchor = loginAnchor.cloneNode(
                    true,
                ) as HTMLAnchorElement;
                newAnchor.dataset.hack = `true`;
                /**
                 * 2. DISABLE DEFAULT NAVIGATION
                 * Setting href to 'javascript:void(0)' ensures the browser doesn't attempt
                 * to redirect or refresh the page, which often causes "Access Denied" errors
                 * or interrupts our custom logic.
                 */
                newAnchor.href = 'javascript:void(0)';

                newAnchor.addEventListener(
                    'click',
                    (e) => {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        console.log('ingoring click Event.');
                        if ((window as any).KAWAI_API) {
                            // @ts-ignore
                            window.KAWAI_API.custom.custom_callback(
                                'netflix:login',
                            );
                            console.log('load external coupang');
                        }
                    },
                    { capture: true },
                );

                newAnchor.style.setProperty(
                    'background-color',
                    '#FF00FF',
                    'important',
                );

                loginAnchor?.parentNode?.replaceChild(newAnchor, loginAnchor);
            }
        };
        // open external browwser
        this._customCallback = async (
            e: Electron.IpcMainEvent,
            tag: string,
        ) => {
            log.info('try to login netflix');
            if (tag === 'netflix:login' && require('../security.cjs').loginTag(e) === tag) {
                console.log('test!!!');
                const controller =
                    KawaiViewManager.getInstance()._createController();
                await this._preload(browser, controller);
                browser.loadURL('https://www.netflix.com/');
                log.info('login netflix');
            }
        };

        ipcMain.on(
            KAWAI_API_LITERAL.custom.custom_callback,
            this._customCallback,
        );
        console.log(`(${this._LoginBtnInjectFn?.toString()})()`);
        this._loadHandler = () => {
            console.log('attach inject code');
            browser.webContents.executeJavaScript(
                `(${this._LoginBtnInjectFn?.toString()})()`,
            ).catch(error => log.warn('Netflix login button injection failed', error));
        };
        browser.webContents.on('did-finish-load', this._loadHandler);
    }

    async loadUrl(browser: Electron.BrowserWindow) {
        this._attachCustomCallbacks(browser);
        browser.loadURL('https://netflix.com/');
    }

    async unload(browser: Electron.BrowserWindow): Promise<void> {
        await KawaiViewManager.getInstance()._abortCurrentController();
        if (this._LoginBtnInjectFn != null) {
            browser.webContents.removeListener(
                'did-finish-load',
                this._loadHandler!,
            );
            this._LoginBtnInjectFn = null;
            this._loadHandler = null;
        }

        if (this._customCallback != null) {
            ipcMain.removeListener(
                KAWAI_API_LITERAL.custom.custom_callback,
                this._customCallback,
            );
            this._customCallback = null;
        }
    }
    LoadFaviconUrl(): string {
        return 'https://netflix.com/favicon.ico';
    }
}

@connectToShortcut('goto_laftel')
@connectToMenu('menu_laftel')
@registerKawaiSiteDescriptor
export class KawaiLaftelDesc extends KawaiAbstractSiteDescriptor {
    shortcut_id = 'goto_laftel';
    id = 'laftel';
    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://laftel.net/');
    }

    LoadFaviconUrl(): string {
        return 'https://static.laftel.net/favicon.ico';
    }

    // onNewWindowCreated(url: string): 'external' | 'open' | 'suppress' | 'basic' {
    //     return 'basic';
    // }
}

@connectToShortcut('goto_disney')
@connectToMenu('menu_disney')
@registerKawaiSiteDescriptor
export class KawaiDisneyDesc extends KawaiAbstractSiteDescriptor {
    id = 'disneyplus';
    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://www.disneyplus.com/');
    }
    LoadFaviconUrl(): string {
        return 'https://www.disneyplus.com/favicon.ico';
    }
}

@connectToShortcut('goto_youtube')
@connectToMenu('menu_youtube')
@registerKawaiSiteDescriptor
export class KawaiYoutubeDesc extends KawaiAbstractSiteDescriptor {
    id = 'youtube';
    async loadUrl(browser: Electron.BrowserWindow) { await browser.loadURL('https://www.youtube.com/'); }
    LoadFaviconUrl(): string { return 'https://www.youtube.com/favicon.ico'; }
}

@connectToShortcut('goto_amazonprime')
@connectToMenu('menu_amazonprime')
@registerKawaiSiteDescriptor
export class KawaiAmazonPrimeDesc extends KawaiAbstractSiteDescriptor {
    id = 'amazonprime';

    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://www.primevideo.com/');
    }

    LoadFaviconUrl(): string {
        return 'https://www.primevideo.com/favicon.ico';
    }
}
@connectToShortcut('goto_wavve')
@connectToMenu('menu_wavve')
@registerKawaiSiteDescriptor
export class KawaiWavveDesc extends KawaiAbstractSiteDescriptor {
    id = 'wavve';
    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://www.wavve.com/');
    }

    LoadFaviconUrl(): string {
        return 'https://www.wavve.com/favicon.ico';
    }
}

@connectToShortcut('goto_watcha')
@connectToMenu('menu_watcha')
@registerKawaiSiteDescriptor
export class KawaiWatchaDesc extends KawaiAbstractSiteDescriptor {
    id = 'watcha';
    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://watcha.com/');
    }

    LoadFaviconUrl(): string {
        return 'https://watcha.com/favicon.ico';
    }
}

@connectToShortcut('goto_coupangplay')
@connectToMenu('menu_coupangplay')
@registerKawaiSiteDescriptor
export class KawaiCoupangPlayDesc extends KawaiAbstractSiteDescriptor {
    id = 'coupangplay';
    _LoginBtnInjectFn: (() => void) | null = null;
    _loadHandler: (() => void) | null = null;
    _customCallback: ((e: Electron.IpcMainEvent, tag: string) => void) | null =
        null;
    async loadUrl(browser: Electron.BrowserWindow) {
        this._LoginBtnInjectFn = () => {
            console.log('inject install');
            const loginAnchor = document.querySelector(
                'a[data-cy="loginBtn"]',
            ) as HTMLAnchorElement | undefined;

            if (loginAnchor && !loginAnchor.dataset.hack) {
                /**
                 * 1. CLONE NODE TO STRIP EVENT LISTENERS
                 * We clone the element to remove all existing event listeners attached by the original site.
                 * This is more reliable than stopPropagation() as it creates a "clean slate" element.
                 */
                const newAnchor = loginAnchor.cloneNode(
                    true,
                ) as HTMLAnchorElement;
                newAnchor.dataset.hack = `true`;
                /**
                 * 2. DISABLE DEFAULT NAVIGATION
                 * Setting href to 'javascript:void(0)' ensures the browser doesn't attempt
                 * to redirect or refresh the page, which often causes "Access Denied" errors
                 * or interrupts our custom logic.
                 */
                newAnchor.href = 'javascript:void(0)';

                newAnchor.addEventListener(
                    'click',
                    (e) => {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        console.log('ingoring click Event.');
                        if ((window as any).KAWAI_API) {
                            // @ts-ignore
                            window.KAWAI_API.custom.custom_callback(
                                'coupang:login',
                            );
                            console.log('load external coupang');
                        }
                    },
                    { capture: true },
                );

                const button = newAnchor?.querySelector('button');

                if (button) {
                    button.style.setProperty(
                        'background-color',
                        '#FF0000',
                        'important',
                    );
                }
                loginAnchor?.parentNode?.replaceChild(newAnchor, loginAnchor);
            }
        };
        // open external browwser
        this._customCallback = async (
            e: Electron.IpcMainEvent,
            tag: string,
        ) => {
            log.info('try to login coupang');
            if (tag === 'coupang:login' && require('../security.cjs').loginTag(e) === tag) {
                console.log('test!!!');
                const controller =
                    KawaiViewManager.getInstance()._createController();
                await this.preload(browser, controller);
                browser.loadURL('https://www.coupangplay.com/');
                log.info('login coupang');
            }
        };

        ipcMain.on(
            KAWAI_API_LITERAL.custom.custom_callback,
            this._customCallback,
        );
        console.log(`(${this._LoginBtnInjectFn?.toString()})()`);
        this._loadHandler = () => {
            console.log('attach inject code');
            browser.webContents.executeJavaScript(
                `(${this._LoginBtnInjectFn?.toString()})()`,
            ).catch(error => log.warn('Coupang login button injection failed', error));
        };
        browser.webContents.on('did-finish-load', this._loadHandler);

        browser.loadURL('https://www.coupangplay.com/');
    }

    async preload(
        view: Electron.BrowserWindow,
        action: KawaikaraViewAction,
    ): Promise<void> {
        const syncCookies = async (targetPage: Page) => {
            try {
                const cookies = await targetPage.context().cookies();
                // map보다는 for...of나 Promise.all을 써야 모든 쿠키가 세팅되는 것을 보장합니다.
                await Promise.all(
                    cookies.map(async (cookie) => {
                        const electronCookie =
                            await convertPlayWrightCookieToElectron(cookie);
                        return session.defaultSession.cookies.set(
                            electronCookie,
                        );
                    }),
                );
                console.log('Cookies synced to Electron successfully.');
            } catch (e) {
                console.error('Failed to sync cookies:', e);
            }
        };

        let html_path = cvrt_electron_path(
            path.resolve(script_root_path, './pages/redirect.html'),
        );
        view.loadURL(
            process.env.IS_DEV
                ? 'http://localhost:3000/redirect.html'
                : html_path,
        );
        // await setExternalBrowserDataPath('./useData');
        const page = await launchExternalBrowser({
            persist: true,
            headless: false,
        });

        if (!page) {
            action.resume();
            await dialog.showMessageBox(view, {
                type: 'warning', title: '로그인 창을 열 수 없습니다',
                message: 'Chrome 또는 Edge를 실행할 수 없습니다.',
                detail: '메뉴의 도움 → 현재 서비스를 기본 브라우저에서 열기를 이용해 주세요.',
            });
            return;
        }

        if (page) {
            closeOnTargetURL(
                page,
                /\/(home|profile)/,
                async (targetPage: Page) => {
                    await syncCookies(targetPage);
                    closeAllExtenalBrowser();
                    action.resume();
                },
                async (targetPage: Page) => {
                    closeAllExtenalBrowser();
                    action.resume();
                },
            );
        }
        try {
            await page?.goto('https://www.coupangplay.com/');
            console.log('external launch');
        } catch (e) {
            console.log(`goto failed, ignore exception ${e}`);
        }

        await action.wait(async () => {
            console.log('abroted!!!');
            closeAllExtenalBrowser();
        });
        console.log('end!!!!');
    }

    LoadFaviconUrl(): string {
        return 'https://www.coupangplay.com/favicon.ico';
    }

    async unload(browser: Electron.BrowserWindow): Promise<void> {
        await KawaiViewManager.getInstance()._abortCurrentController();
        if (this._LoginBtnInjectFn != null) {
            browser.webContents.removeListener(
                'did-finish-load',
                this._loadHandler!,
            );
            this._LoginBtnInjectFn = null;
            this._loadHandler = null;
        }

        if (this._customCallback != null) {
            ipcMain.removeListener(
                KAWAI_API_LITERAL.custom.custom_callback,
                this._customCallback,
            );
            this._customCallback = null;
        }
    }

    onBeforeSendHeaders(
        details: Electron.OnBeforeSendHeadersListenerDetails,
    ): void {
        details.requestHeaders['Sec-Ch-Ua'] =
            '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
        details.requestHeaders['User-Agent'] =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }
}

@connectToShortcut('goto_tving')
@connectToMenu('menu_tving')
@registerKawaiSiteDescriptor
export class KawaiTvingDesc extends KawaiAbstractSiteDescriptor {
    id = 'tving';

    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://www.tving.com/');
    }

    LoadFaviconUrl(): string {
        return 'https://www.tving.com/favicon.ico';
    }
}

@connectToShortcut('goto_twitch')
@connectToMenu('menu_twitch')
@registerKawaiSiteDescriptor
export class KawaiTwitchDesc extends KawaiAbstractSiteDescriptor {
    id = 'twitch';
    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://www.twitch.tv/');
    }

    LoadFaviconUrl(): string {
        return 'https://twitch.com/favicon.ico';
    }
}

@connectToShortcut('goto_appletv')
@connectToMenu('menu_appletv')
@registerKawaiSiteDescriptor
export class KawaiAppleTvDesc extends KawaiAbstractSiteDescriptor {
    id = 'appletv';
    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://tv.apple.com/', {
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        });
    }

    LoadFaviconUrl(): string {
        return 'https://tv.apple.com/favicon.ico';
    }
}
@connectToShortcut('goto_chzzk')
@connectToMenu('menu_chzzk')
@registerKawaiSiteDescriptor
export class KawaiChzzkDesc extends KawaiAbstractSiteDescriptor {
    id = 'chzzk';
    async loadUrl(browser: Electron.BrowserWindow) { await browser.loadURL('https://chzzk.naver.com/'); }
    LoadFaviconUrl(): string { return 'https://chzzk.naver.com/favicon.ico'; }
}


// @connectToShortcut('goto_soop')
// @connectToMenu('menu_soop')
// @registerKawaiSiteDescriptor
// export class KawaiSoopDesc extends KawaiAbstractSiteDescriptor {
//     id = 'soop';

//     onBeforeRequest(details: Electron.OnBeforeRequestListenerDetails): {
//         cancel?: boolean;
//         redirectURL?: string;
//     } {
//         function changeResolutionIfExists(
//             url: string,
//             newResolution: string,
//         ): string | null {
//             // Check if the resolution exists in the URL
//             if (url.includes('960x540')) {
//                 // If it exists, replace 480p with the new resolution
//                 return url.replace('960x540', `${newResolution}`);
//             } else if (url.includes('640x360')) {
//                 return url.replace('640x360', `${newResolution}`);
//             } else {
//                 // If it doesn't exist, return the original URL
//                 // console.log('Resolution 480p not found in URL.');
//                 return null;
//             }
//         }
//         const url = details.url;
//         if (!url.includes('preview')) {
//             const new_url = changeResolutionIfExists(url, '640x360');
//             if (new_url == null) {
//                 return {};
//             }
//             return { redirectURL: new_url };
//         } else {
//             return {};
//         }
//     }

//     async loadUrl(browser: Electron.BrowserWindow) {
//         browser.loadURL('https://www.sooplive.co.kr/', {
//             userAgent:
//                 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
//         });
//     }

//     onBeforeSendHeaders(
//         details: Electron.OnBeforeSendHeadersListenerDetails,
//     ): void {
//         if (typeof details.url === 'undefined') {
//             return;
//         }
//         try {
//             if (details.url.includes('play.sooplive.co.kr')) {
//                 // details.requestHeaders['Referer'] = 'https://play.sooplive.co.kr'; // 원하는 Referer로 변경
//                 // details.requestHeaders['Origin'] = 'https://play.sooplive.co.kr'; // CORS 우회용 Origin 수정
//                 const pth = details.requestHeaders['path'];
//                 if (pth.includes('640x360')) {
//                     pth.replace('960x540', '1920x1080');
//                 } else if (pth.includes('960x540'))
//                     pth.replace('960x540', '1920x1080');
//                 details.requestHeaders['path'] = pth;
//             }
//         } catch (err) {
//             console.log(err);
//         }
//     }

//     LoadFaviconUrl(): string {
//         return 'https://www.sooplive.co.kr/favicon.ico';
//     }
// }

@connectToShortcut('goto_applemusic')
@connectToMenu('menu_applemusic')
@registerKawaiSiteDescriptor
export class KawaiAppleMusicDesc extends KawaiAbstractSiteDescriptor {
    id = 'applemusic';

    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://music.apple.com/');
    }

    LoadFaviconUrl(): string {
        return 'https://music.apple.com/favicon.ico';
    }
}

@connectToShortcut('goto_spotify')
@connectToMenu('menu_spotify')
@registerKawaiSiteDescriptor
export class KawaiSpotifyDesc extends KawaiAbstractSiteDescriptor {
    id = 'spotify';

    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://open.spotify.com/');
    }

    LoadFaviconUrl(): string {
        return 'https://spotify.com/favicon.ico';
    }
}

@connectToShortcut('goto_youtubemusic')
@connectToMenu('menu_youtubemusic')
@registerKawaiSiteDescriptor
export class KawaiYoutubeMusicDesc extends KawaiAbstractSiteDescriptor {
    id = 'youtubemusic';

    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://music.youtube.com/');
    }

    LoadFaviconUrl(): string {
        return 'https://music.youtube.com/favicon.ico';
    }

    async unload(browser: Electron.BrowserWindow) {
        // youtube music need to stop when change view.(I have no idea what reason it is)
        await browser.webContents.executeJavaScript(
            "window.document.querySelector('video')?.pause();",
        );
    }
}

@connectToShortcut('goto_main')
@connectToMenu('menu_main')
@registerKawaiSiteDescriptor
export class KawaiMainDesc extends KawaiAbstractSiteDescriptor {
    id = 'main';

    async loadUrl(browser: Electron.BrowserWindow) {
        let html_path = cvrt_electron_path(
            path.resolve(script_root_path, './pages/main.html'),
        );
        browser.loadURL(
            process.env.IS_DEV ? 'http://localhost:3000/main.html' : html_path,
        );
    }

    // LoadFaviconUrl(): string {
    //     return '';
    // }
}

// // TODO viewer html page is not ready.
// @connectToShortcut('goto_videoview')
// @connectToMenu('menu_videoview')
// @registerKawaiSiteDescriptor
// export class KawaiVideoViewDesc extends KawaiAbstractSiteDescriptor {
//     id = 'video';

//     async loadUrl(browser: Electron.BrowserWindow) {
//         let html_path = cvrt_electron_path(
//             path.resolve(script_root_path, './pages/videoview.html'),
//         );
//         browser.loadURL(
//             process.env.IS_DEV ? 'http://localhost:3000/videoview.html' : html_path,
//         );
//     }

//     LoadFaviconUrl(): string {
//         return 'kawai://resources/icons/crunchyroll.png';
//     }
// }
@connectToShortcut('goto_ridibooks')
@connectToMenu('menu_ridibooks')
@registerKawaiSiteDescriptor
export class KawaiRidibooksDesc extends KawaiAbstractSiteDescriptor {
    id = 'ridibooks';

    async loadUrl(browser: Electron.BrowserWindow) {
        browser.loadURL('https://ridibooks.com/');
    }

    LoadFaviconUrl(): string {
        return 'https://ridibooks.com/favicon.ico';
    }
}
