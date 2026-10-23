import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';

import { getBasePath, withBasePath } from './lib/base-path';
// Load runtime security configuration during process startup so an unsecured controller emits its
// warning immediately, before the first HTTP or WebSocket request arrives.
import './lib/server/control-auth';

const startFetch = createStartHandler({
    handler: defaultStreamHandler,
    // TanStack's build manifest contains root-absolute asset URLs. Prefix them while resolving the
    // SSR manifest so the same build can be mounted at APP_BASE_PATH without buffering HTML.
    transformAssets: {
        cache: true,
        transform: ({ url }) => ({
            href: withBasePath(url.replace(/^\/\.\//, '/'))
        })
    }
});

async function publicAsset(request: Request): Promise<Response | null> {
    const pathname = new URL(request.url).pathname;
    const base = getBasePath();
    const prefix = pathname.startsWith(`${base}/public/`)
        ? `${base}/public/`
        : pathname.startsWith('/public/')
          ? '/public/'
          : null;
    if (!prefix) return null;
    const relativePath = pathname.slice(prefix.length);
    if (
        !/^(?:assets|project)\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(relativePath) &&
        relativePath !== 'favicon.svg'
    ) {
        return null;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405 });
    }
    const contentTypes: Record<string, string> = {
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.woff2': 'font/woff2',
        '.wasm': 'application/wasm'
    };
    try {
        const content = await readFile(resolve(process.cwd(), '.output/public', relativePath));
        return new Response(request.method === 'HEAD' ? null : new Uint8Array(content), {
            headers: {
                'content-type': contentTypes[extname(relativePath)] ?? 'application/octet-stream',
                'x-content-type-options': 'nosniff'
            }
        });
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return new Response('Not found', { status: 404 });
        }
        throw error;
    }
}

async function fetch(request: Request): Promise<Response> {
    const asset = await publicAsset(request);
    if (asset) return asset;
    return startFetch(request);
}

export default { fetch };
