const META_NAME = 'data-deserts-base-path';

export function normalizeBasePath(value: string | undefined | null): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed || trimmed === '/') return '';
    return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

/** Runtime deployment prefix. On the client it is read from SSR-generated document metadata. */
export function getBasePath(): string {
    if (typeof document !== 'undefined') {
        return normalizeBasePath(
            document.querySelector<HTMLMetaElement>(`meta[name="${META_NAME}"]`)?.content
        );
    }
    const runtime = globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
    };
    return normalizeBasePath(runtime.process?.env?.APP_BASE_PATH);
}

export function withBasePath(path: string): string {
    if (!path.startsWith('/') || path.startsWith('//')) return path;
    const basePath = getBasePath();
    if (basePath.startsWith('/serve/')) {
        const assetPath = path.startsWith(`${basePath}/`) ? path.slice(basePath.length) : path;
        if (
            assetPath.startsWith('/assets/') ||
            assetPath.startsWith('/project/') ||
            assetPath === '/favicon.svg'
        ) {
            return `${basePath}/public${assetPath}`;
        }
    }
    // Vite has already prefixed URLs imported with ?url and emitted in its manifest.
    return path === basePath || path.startsWith(`${basePath}/`) ? path : `${basePath}${path}`;
}

/** Add the preview grant to browser requests without changing SSR-rendered markup. */
export function withPreviewSession(path: string): string {
    if (!path.startsWith('/') || path.startsWith('//')) return path;
    const appPath = withBasePath(path);
    const basePath = getBasePath();
    if (typeof window === 'undefined' || !basePath.startsWith('/serve/')) return appPath;
    const session = new URLSearchParams(window.location.search).get('__vizzySession');
    if (!session) return appPath;
    const url = new URL(appPath, window.location.href);
    url.searchParams.set('__vizzySession', session);
    return `${url.pathname}${url.search}${url.hash}`;
}

/** API calls from Vizzy's opaque preview frame need the preview cookie. */
export function fetchWithCredentials(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (typeof window === 'undefined' || !getBasePath().startsWith('/serve/')) {
        return globalThis.fetch(input, init);
    }
    return globalThis.fetch(typeof input === 'string' ? withPreviewSession(input) : input, {
        ...init,
        credentials: 'include'
    });
}

export const basePathMetaName = META_NAME;
