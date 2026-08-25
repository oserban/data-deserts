import { timingSafeEqual } from 'node:crypto';

const configuredToken = process.env.DO_WALL_CONTROL_TOKEN?.trim() ?? '';

if (!configuredToken) {
    console.warn(
        '[data-deserts] WARNING: DO_WALL_CONTROL_TOKEN is not configured. ' +
            'The presenter controller is publicly accessible. Configure a strong token in production.'
    );
}

export function isControlTokenRequired() {
    return configuredToken.length > 0;
}

export function validateControlToken(candidate: unknown) {
    if (!configuredToken) return true;
    if (typeof candidate !== 'string') return false;
    const expected = Buffer.from(configuredToken);
    const actual = Buffer.from(candidate);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function developmentControlToken() {
    return import.meta.env.DEV ? configuredToken : '';
}
