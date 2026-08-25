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
    return `${getBasePath()}${path}`;
}

export const basePathMetaName = META_NAME;
