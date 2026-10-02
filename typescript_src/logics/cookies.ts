import { Cookie } from 'patchright';

export async function convertPlayWrightCookieToElectron(cookie: Cookie) {
    let sameSiteValue:
        | 'no_restriction'
        | 'lax'
        | 'strict'
        | 'unspecified'
        | undefined;

    if (cookie.sameSite === 'None') {
        sameSiteValue = 'no_restriction';
    } else if (cookie.sameSite === 'Lax') {
        sameSiteValue = 'lax';
    } else if (cookie.sameSite === 'Strict') {
        sameSiteValue = 'strict';
    } else {
        sameSiteValue = 'unspecified';
    }

    const cookieDetails = {
        url: `https://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expires,
        sameSite: sameSiteValue,
    };

    return cookieDetails;
}

export async function convertElectronCookieToPlaywright(
    cookie: Electron.Cookie,
): Promise<Cookie> {
    let sameSiteValue: 'None' | 'Lax' | 'Strict' | 'unspecified' | undefined;

    if (cookie.sameSite === 'no_restriction') {
        sameSiteValue = 'None';
    } else if (cookie.sameSite === 'lax') {
        sameSiteValue = 'Lax';
    } else if (cookie.sameSite === 'strict') {
        sameSiteValue = 'Strict';
    } else {
        sameSiteValue = 'None';
    }

    const cookieDetails: Cookie = {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain ?? '',
        path: cookie.path ?? '/',
        secure: cookie.secure ?? false,
        httpOnly: cookie.httpOnly ?? false,
        expires: cookie.expirationDate ?? 0,
        sameSite: sameSiteValue,
    };
    return cookieDetails;
}
