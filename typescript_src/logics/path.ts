import { pathToFileURL } from 'node:url';

/**
 *
 * @param pth platform dependant filesystem path literal.
 * @returns electron's filesystem path literal.
 */
export function cvrt_electron_path(pth: string) {
    return pathToFileURL(pth).href;
}
