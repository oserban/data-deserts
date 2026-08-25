import type { Store } from '@tanstack/react-store';

import { withBasePath } from '../../base-path';
import type { BusMessage, EngineRole, EngineStoreState, HelloBusMessage } from '../types';

const RECONNECT_DELAY_MS = 1_500;
const POLL_INTERVAL_MS = 750;

/** Shared browser transport. WebSocket is preferred; HTTP polling is its host-independent fallback. */
export abstract class BusEngine<TStoreState extends EngineStoreState = EngineStoreState> {
    private readonly role: EngineRole;
    protected readonly store: Store<TStoreState>;
    private socket: WebSocket | null = null;
    private reconnectTimer: number | null = null;
    private pollTimer: number | null = null;
    private started = false;
    private controlToken = '';

    protected constructor(role: EngineRole, store: Store<TStoreState>) {
        this.role = role;
        this.store = store;
    }

    start(controlToken = '') {
        if (this.started || typeof window === 'undefined') return;
        this.controlToken = controlToken;
        this.started = true;
        this.connect();
    }

    send(message: BusMessage) {
        const payload =
            this.role === 'control' ? { ...message, controlToken: this.controlToken } : message;
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(payload));
            return;
        }
        if (message.type === 'state/update') {
            void fetch(withBasePath('/api/state'), {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-control-token': this.controlToken
                },
                body: JSON.stringify(payload)
            });
        }
    }

    protected onMessage(_message: BusMessage) {}
    protected onHello(_message: HelloBusMessage) {}

    private connect() {
        if (this.socket || typeof WebSocket === 'undefined') {
            this.startHttpFallback();
            return;
        }
        this.setConnection('connecting');
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const socket = new WebSocket(
            `${protocol}://${window.location.host}${withBasePath('/bus')}`
        );
        this.socket = socket;
        socket.onopen = () => {
            if (this.socket !== socket) return;
            this.stopHttpFallback();
            this.setConnection('open');
        };
        socket.onmessage = (event) => {
            if (this.socket === socket && typeof event.data === 'string') this.receive(event.data);
        };
        socket.onerror = () => {
            if (this.socket === socket) this.setConnection('error', 'WebSocket error');
        };
        socket.onclose = () => {
            if (this.socket !== socket) return;
            this.socket = null;
            this.setConnection('closed');
            this.startHttpFallback();
            this.scheduleReconnect();
        };
    }

    private receive(raw: string) {
        let message: BusMessage;
        try {
            message = JSON.parse(raw) as BusMessage;
            if (!message || typeof message.type !== 'string') return;
        } catch {
            this.setConnection('error', 'Invalid JSON message');
            return;
        }
        this.store.setState((previous) => ({
            ...previous,
            messageCount: previous.messageCount + 1,
            lastMessageType: message.type,
            lastMessageAt: Date.now()
        }));
        if (message.type === 'hello') {
            const hello = message as HelloBusMessage;
            this.store.setState((previous) => ({ ...previous, peerId: hello.peerId }));
            this.onHello(hello);
            return;
        }
        if (message.peerId && message.peerId === this.store.state.peerId) return;
        this.onMessage(message);
    }

    private startHttpFallback() {
        if (this.pollTimer !== null) return;
        const poll = async () => {
            try {
                const response = await fetch(withBasePath('/api/state'), { cache: 'no-store' });
                if (!response.ok) {
                    this.setConnection('error', `HTTP state transport returned ${response.status}`);
                    return;
                }
                const state = await response.json();
                this.store.setState((previous) => ({
                    ...previous,
                    ...state,
                    connection: 'open',
                    lastError: null
                }));
            } catch {
                this.setConnection('error', 'HTTP state transport error');
            }
        };
        void poll();
        if (this.role === 'screen') this.pollTimer = window.setInterval(poll, POLL_INTERVAL_MS);
    }

    private stopHttpFallback() {
        if (this.pollTimer === null) return;
        window.clearInterval(this.pollTimer);
        this.pollTimer = null;
    }

    private scheduleReconnect() {
        if (this.reconnectTimer !== null) return;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, RECONNECT_DELAY_MS);
    }

    private setConnection(
        connection: EngineStoreState['connection'],
        lastError: string | null = null
    ) {
        this.store.setState((previous) => ({ ...previous, connection, lastError }));
    }
}
