import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { MiniControllerParticipant } from '../realtime/types';

type Session = MiniControllerParticipant & {
    token: string;
    expiresAt: number;
    peerId: string | null;
    additions: number[];
};

const runtime = globalThis as typeof globalThis & {
    __dataDesertsMiniAuth?: {
        secret: Buffer;
        usedInvitations: Map<string, number>;
        sessions: Map<string, Session>;
    };
};
const storage = (runtime.__dataDesertsMiniAuth ??= {
    secret: randomBytes(32),
    usedInvitations: new Map(),
    sessions: new Map()
});

const seconds = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
};
export const invitationTtlSeconds = () => seconds('MINI_CONTROLLER_QR_TTL_SECONDS', 30);
export const sessionTtlSeconds = () => seconds('MINI_CONTROLLER_SESSION_TTL_SECONDS', 600);
const encode = (value: string) => Buffer.from(value).toString('base64url');
const sign = (value: string) =>
    createHmac('sha256', storage.secret).update(value).digest('base64url');

export function createInvitation() {
    cleanup();
    const expiresAt = Date.now() + invitationTtlSeconds() * 1_000;
    const payload = encode(JSON.stringify({ expiresAt, nonce: randomBytes(12).toString('hex') }));
    return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function exchangeInvitation(token: string) {
    cleanup();
    const invitation = verifyInvitation(token);
    if (!invitation || storage.usedInvitations.has(invitation.nonce)) return null;
    storage.usedInvitations.set(invitation.nonce, invitation.expiresAt);
    const sessionToken = randomBytes(32).toString('base64url');
    const session: Session = {
        token: sessionToken,
        id: randomBytes(8).toString('hex'),
        name: '',
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        expiresAt: Date.now() + sessionTtlSeconds() * 1_000,
        peerId: null,
        additions: []
    };
    storage.sessions.set(sessionToken, session);
    return { token: sessionToken, expiresAt: session.expiresAt };
}

export function authenticateSession(token: string, peerId?: string, name?: string) {
    cleanup();
    const session = storage.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) return null;
    if (peerId) session.peerId = peerId;
    if (name !== undefined) session.name = cleanName(name);
    session.lastSeenAt = Date.now();
    return session;
}

export function canAddCountry(session: Session) {
    const cutoff = Date.now() - 60_000;
    session.additions = session.additions.filter((time) => time >= cutoff);
    if (session.additions.length >= 12) return false;
    session.additions.push(Date.now());
    return true;
}

export function disconnectPeer(peerId: string) {
    for (const [token, session] of storage.sessions) {
        if (session.peerId === peerId) storage.sessions.delete(token);
    }
}

export function revokeAllSessions() {
    const count = storage.sessions.size;
    storage.sessions.clear();
    return count;
}

export function activeParticipants(): MiniControllerParticipant[] {
    cleanup();
    return [...storage.sessions.values()]
        .filter((session) => session.name && session.peerId)
        .map(({ id, name, connectedAt, lastSeenAt }) => ({ id, name, connectedAt, lastSeenAt }));
}

function verifyInvitation(token: string) {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = sign(payload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
        actualBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(actualBuffer, expectedBuffer)
    )
        return null;
    try {
        const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
            expiresAt?: unknown;
            nonce?: unknown;
        };
        return typeof parsed.expiresAt === 'number' &&
            parsed.expiresAt > Date.now() &&
            typeof parsed.nonce === 'string'
            ? { expiresAt: parsed.expiresAt, nonce: parsed.nonce }
            : null;
    } catch {
        return null;
    }
}

function cleanName(value: string) {
    return value.trim().replace(/\s+/g, ' ').replace(/[<>]/g, '').slice(0, 60);
}

function cleanup() {
    const now = Date.now();
    for (const [nonce, expiresAt] of storage.usedInvitations)
        if (expiresAt <= now) storage.usedInvitations.delete(nonce);
    for (const [token, session] of storage.sessions)
        if (session.expiresAt <= now) storage.sessions.delete(token);
}
