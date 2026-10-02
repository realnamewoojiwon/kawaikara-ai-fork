// externalBrowser.ts
// depend on patchwright(This is a variant of Playwright)

import { chromium, Frame, Page, Request } from 'patchright';
import { global_object } from '../data/context';
import path from 'node:path';
import { promises as fs } from 'fs';
import * as os from 'os';
import { app } from 'electron';

const defaultPath = path.join(app.getPath('userData'), 'external-login');

export interface ExternalBrowserDescriptor {
    /**
     * if url is undefined, then empty page will be loaded.
     */
    url?: string;
    persist?: boolean;
    headless?: boolean;
    waitForCallback?: { url: string; timeout?: string };
}

/**
 *
 * @param desc
 */
export async function launchExternalBrowser({
    persist = false,
    headless = false,
    waitForCallback,
}: ExternalBrowserDescriptor) {
    // if path was undeifend or invalid then use stateless browser
    try {
        await createBrowser(persist, headless);
        const page = await openPage();
        // await page?.bringToFront();

        // show browser on topside
        await page?.evaluate(() => {
            window.focus();
        });
        return page;
    } catch (e) {
        console.log(`error page : ${e}`);
    }
    return null;
}

/**
 * this is helper function waiting for target url
 * @param page
 * @param regex
 */
export function closeOnTargetURL(
    page: Page,
    targetReg: RegExp,
    onSuceess?: (page: Page) => void | Promise<void>,
    onClose?: (page: Page) => void | Promise<void>,
) {
    let isTriggered = false;
    const check = async (url: string) => {
        if (!isTriggered && targetReg.test(url)) {
            isTriggered = true;
            console.log('Login completion detected');
            page.off('framenavigated', navHandler);
            page.off('request', requestHandler);
            await onSuceess?.(page);
        }
    };
    console.log('Waiting for login completion');
    const navHandler = async (frame: Frame) => {
        if (frame === page.mainFrame()) {
            check(frame.url()).catch(error => console.error('Login completion failed:', error));
        }
    };
    const requestHandler = async (request: Request) => {
        // 'docmument' 오타를 'document'로 수정
        if (request.resourceType() === 'document') {
            check(page.url()).catch(error => console.error('Login completion failed:', error));
        }
    };

    page.on('framenavigated', navHandler);
    page.on('request', requestHandler);

    page.once('close', async (page: Page) => {
        page.off('framenavigated', navHandler);
        page.off('request', requestHandler);
        if (!isTriggered) await onClose?.(page);
        console.log('close all listener');
    });
}

export async function closeAllExtenalBrowser() {
    const state = global_object.externalBrowser;
    const browser = state?.browser;
    const context = state?.browserContext;
    if (state) {
        state.browser = undefined;
        state.browserContext = undefined;
    }
    await Promise.allSettled([browser?.close(), context?.close()]);
}

/**
 *
 * @param persist
 * @param headless
 */
async function createBrowser(persist: boolean, headless: boolean) {
    await closeAllExtenalBrowser();
    if (typeof global_object.externalBrowser?.dataPath === 'undefined') {
        setExternalBrowserDataPath(defaultPath);
        console.log(`use default path : ${defaultPath}`);
    }

    if (typeof global_object.externalBrowser === 'undefined') {
        global_object.externalBrowser = {};
    }

    // remove url bar
    // show empty browser
    const args = ['--app=data:text/html,<html></html>'];
    
    const chromeOptions = { headless, channel: 'chrome', args };
    const edgeOptions = { headless, channel: 'msedge', args };

    if (persist) {
        try {
            global_object.externalBrowser.browserContext =
                await chromium.launchPersistentContext(
                    global_object.externalBrowser?.dataPath!,
                    chromeOptions
                );
        } catch (error) {
            console.log('Chrome not found, trying msedge instead.');
            global_object.externalBrowser.browserContext =
                await chromium.launchPersistentContext(
                    global_object.externalBrowser?.dataPath!,
                    edgeOptions
                );
        }
    } else {
        try {
            global_object.externalBrowser.browser = await chromium.launch(chromeOptions);
        } catch (error) {
            console.log('Chrome not found, trying msedge instead.');
            global_object.externalBrowser.browser = await chromium.launch(edgeOptions);
        }
    }
}

/**
 *
 * @param url
 * @returns
 */
// async function openPage(url?: string) {
async function openPage() {
    const page = (await openPageFromContext()) || (await openPageFromBrowser());

    return page;
}

/**
 * create page from context object
 * @returns
 */
async function openPageFromContext(): Promise<Page | null> {
    const externalContext = global_object.externalBrowser?.browserContext;
    if (typeof externalContext === 'undefined') return null;

    const page: Page =
        externalContext.pages()[0] || (await externalContext.newPage());

    return page;
}

/**
 * create page from browser object
 * @returns
 */
async function openPageFromBrowser(): Promise<Page | null> {
    const externalBrowser = global_object.externalBrowser?.browser;

    if (typeof externalBrowser === 'undefined') return null;
    const context =
        externalBrowser.contexts()[0] || (await externalBrowser.newContext());
    const page: Page =
        externalBrowser.contexts()[0].pages()[0] ||
        (await externalBrowser.newPage());

    return page;
}

/**
 *
 * set External Browser(Chrome) user Infos save path.
 * this fucntion Must be called before calling @function openExternalBrowser
 *
 * @param path
 */
export async function setExternalBrowserDataPath(path: string) {
    if (typeof global_object.externalBrowser === 'undefined') {
        global_object.externalBrowser = {};
    }
    global_object.externalBrowser.dataPath = path;
}
