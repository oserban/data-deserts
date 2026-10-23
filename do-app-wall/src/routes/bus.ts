import { createFileRoute } from '@tanstack/react-router';
import { defineHooks, type Peer } from 'crossws';

import type { BusMessage, DataDesertsState } from '../lib/realtime';
import { validateControlToken } from '../lib/server/control-auth';
import {
    activeParticipants,
    authenticateSession,
    canAddCountry,
    disconnectPeer
} from '../lib/server/mini-controller-auth';
import {
    addGuestCountry,
    getWallState,
    setParticipants,
    updateWallState
} from '../lib/server/wall-state';

const miniPeers = new Set<string>();

function isPublicBusPeer(peer: Peer): boolean {
    return new URL(peer.request.url).pathname.endsWith('/public/bus');
}

export const hooks = defineHooks({
    open(peer) {
        // Do not disclose wall state or subscribe until the mini session is validated.
        if (isPublicBusPeer(peer)) return;
        peer.send({ type: 'hello', peerId: peer.id, state: getWallState() });
        peer.subscribe('data-deserts');
        peer.publish('data-deserts', {
            type: 'peer/join',
            peerId: peer.id,
            peerCount: peer.peers.size
        });
    },
    message(peer, message) {
        let payload: Partial<BusMessage> & {
            state?: DataDesertsState;
            token?: unknown;
            name?: unknown;
            iso?: unknown;
            controlToken?: unknown;
        };
        try {
            payload = message.json() as typeof payload;
        } catch {
            return;
        }
        if (
            isPublicBusPeer(peer) &&
            payload.type !== 'mini/hello' &&
            payload.type !== 'mini/add'
        ) return;
        if (payload.type === 'state/update' && payload.state) {
            if (miniPeers.has(peer.id)) return;
            if (!validateControlToken(payload.controlToken)) {
                peer.send({ type: 'control/error', message: 'Invalid controller token.' });
                return;
            }
            const state = updateWallState(payload.state);
            peer.publish('data-deserts', {
                type: 'state/update',
                state,
                peerId: peer.id,
                peerCount: peer.peers.size
            });
            return;
        }
        if (payload.type !== 'mini/hello' && payload.type !== 'mini/add') return;
        if (typeof payload.token !== 'string' || typeof payload.name !== 'string') return;
        const session = authenticateSession(payload.token, peer.id, payload.name);
        if (!session || !session.name) {
            const wasMini = miniPeers.delete(peer.id);
            const state = setParticipants(activeParticipants());
            peer.send({
                type: 'mini/error',
                code: 'expired',
                message: 'This controller has expired. Rescan the QR code.'
            });
            if (wasMini || !isPublicBusPeer(peer)) {
                peer.publish('data-deserts', {
                    type: 'state/update',
                    state,
                    peerId: peer.id,
                    peerCount: peer.peers.size
                });
            }
            return;
        }
        if (isPublicBusPeer(peer) && !miniPeers.has(peer.id)) {
            peer.subscribe('data-deserts');
            peer.send({ type: 'hello', peerId: peer.id, state: getWallState() });
        }
        miniPeers.add(peer.id);
        if (payload.type === 'mini/add') {
            if (typeof payload.iso !== 'string' || !canAddCountry(session)) {
                peer.send({
                    type: 'mini/error',
                    code: 'invalid',
                    message: 'Unable to add that country.'
                });
                return;
            }
            const before = getWallState();
            const state = addGuestCountry(payload.iso, session.name);
            if (state === before) {
                peer.send({
                    type: 'mini/error',
                    code: 'unavailable',
                    message: 'That country is already selected or the wall has reached its limit.'
                });
            }
        }
        const state = setParticipants(activeParticipants());
        peer.send({ type: 'mini/ready', state });
        peer.publish('data-deserts', {
            type: 'state/update',
            state,
            peerId: peer.id,
            peerCount: peer.peers.size
        });
    },
    close(peer) {
        disconnectPeer(peer.id);
        const wasMini = miniPeers.delete(peer.id);
        const state = setParticipants(activeParticipants());
        if (wasMini || !isPublicBusPeer(peer)) {
            peer.publish('data-deserts', {
                type: 'state/update',
                state,
                peerId: peer.id,
                peerCount: peer.peers.size
            });
        }
        peer.unsubscribe('data-deserts');
    }
});

export const Route = createFileRoute('/bus')({
    server: {
        handlers: {
            GET: async () =>
                Object.assign(new Response('WebSocket upgrade is required.', { status: 426 }), {
                    crossws: hooks
                })
        }
    }
});
