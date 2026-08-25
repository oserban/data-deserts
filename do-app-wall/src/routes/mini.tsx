import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import data from '../data/datasets.json';
import world from '../data/world.json';
import { withBasePath } from '../lib/base-path';
import { MAX_COMPARE_COUNTRIES, type DataDesertsState } from '../lib/realtime/types';

type MiniSearch = { token: string };
type SessionResponse = { token: string; expiresAt: number };
const datasets = data.datasets as Record<string, { records: Record<string, unknown> }>;
const DHS_COUNTRIES = world.features
    .filter((feature) => feature.id in datasets.dhs.records)
    .map((feature) => ({ iso: feature.id, name: feature.properties.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

export const Route = createFileRoute('/mini')({
    validateSearch: (search: Record<string, unknown>): MiniSearch => ({
        token: typeof search.token === 'string' ? search.token : ''
    }),
    component: MiniControllerPage
});

function MiniControllerPage() {
    const { token: invitationToken } = Route.useSearch();
    const [session, setSession] = useState<SessionResponse | null>(null);
    const [name, setName] = useState('');
    const [confirmedName, setConfirmedName] = useState('');
    const [query, setQuery] = useState('');
    const [countries, setCountries] = useState<string[]>([]);
    const [status, setStatus] = useState<'opening' | 'name' | 'ready' | 'expired'>('opening');
    const [message, setMessage] = useState('Validating invitation…');
    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        let active = true;
        void fetch(withBasePath('/api/mini/session'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: invitationToken })
        })
            .then(async (response) => {
                if (!active) return;
                if (!response.ok) throw new Error();
                const next = (await response.json()) as SessionResponse;
                setSession(next);
                setStatus('name');
                setMessage('');
            })
            .catch(() => {
                if (active) {
                    setStatus('expired');
                    setMessage('This controller link has expired or has already been opened.');
                }
            });
        return () => {
            active = false;
        };
    }, [invitationToken]);

    useEffect(() => {
        if (!session || !confirmedName || status !== 'ready') return;
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const socket = new WebSocket(
            `${protocol}://${window.location.host}${withBasePath('/bus')}`
        );
        socketRef.current = socket;
        const hello = () =>
            socket.readyState === WebSocket.OPEN &&
            socket.send(
                JSON.stringify({ type: 'mini/hello', token: session.token, name: confirmedName })
            );
        socket.onopen = hello;
        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(String(event.data)) as {
                    type?: string;
                    code?: string;
                    message?: string;
                    state?: DataDesertsState;
                };
                if (payload.state) setCountries(payload.state.countries);
                if (payload.type === 'mini/error') {
                    setMessage(payload.message ?? 'Unable to update the wall.');
                    if (payload.code === 'expired') setStatus('expired');
                } else if (payload.type === 'mini/ready') setMessage('Connected to the wall');
            } catch {
                /* Ignore malformed messages. */
            }
        };
        socket.onclose = () => {
            if (Date.now() < session.expiresAt)
                setMessage('Connection lost. Please rescan the QR code.');
        };
        const heartbeat = window.setInterval(hello, 8_000);
        const expiry = window.setTimeout(
            () => {
                socket.close();
                setStatus('expired');
                setMessage('This controller session has expired.');
            },
            Math.max(0, session.expiresAt - Date.now())
        );
        return () => {
            window.clearInterval(heartbeat);
            window.clearTimeout(expiry);
            socket.close();
            socketRef.current = null;
        };
    }, [session, confirmedName, status]);

    const available = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        return DHS_COUNTRIES.filter(
            (country) =>
                !countries.includes(country.iso) &&
                (!needle ||
                    country.name.toLocaleLowerCase().includes(needle) ||
                    country.iso.toLocaleLowerCase().includes(needle))
        );
    }, [countries, query]);
    const add = (iso: string) => {
        const socket = socketRef.current;
        if (!session || !socket || socket.readyState !== WebSocket.OPEN) {
            setMessage('The wall is not connected.');
            return;
        }
        socket.send(
            JSON.stringify({ type: 'mini/add', token: session.token, name: confirmedName, iso })
        );
        setMessage('Sending selection…');
        setQuery('');
    };

    if (status === 'opening' || status === 'expired')
        return (
            <MiniShell>
                <div className="rounded-2xl border border-[#2c3e50] bg-[#172230] p-6 text-center">
                    <h1 className="text-2xl font-semibold">
                        {status === 'opening' ? 'Opening controller' : 'Rescan the QR code'}
                    </h1>
                    <p className="mt-3 leading-relaxed text-[#9fb0c0]">
                        {message}
                        {status === 'expired'
                            ? ' Please scan the current code shown on the wall.'
                            : ''}
                    </p>
                </div>
            </MiniShell>
        );
    if (status === 'name')
        return (
            <MiniShell>
                <form
                    className="rounded-2xl border border-[#2c3e50] bg-[#172230] p-6"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const clean = name.trim().replace(/\s+/g, ' ').slice(0, 60);
                        if (clean) {
                            setConfirmedName(clean);
                            setStatus('ready');
                        }
                    }}
                >
                    <h1 className="text-2xl font-semibold">Join the wall</h1>
                    <p className="mt-2 text-sm leading-relaxed text-[#9fb0c0]">
                        Enter your name before choosing a DHS country. Your name will appear beside
                        your selection.
                    </p>
                    <label className="mt-6 block text-sm font-semibold">
                        Your name
                        <input
                            autoFocus
                            required
                            maxLength={60}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="mt-2 w-full rounded-xl border border-[#3a5065] bg-[#101923] px-4 py-3 text-base"
                            autoComplete="name"
                        />
                    </label>
                    <button className="mt-5 w-full rounded-xl bg-[#5ec5ff] px-4 py-3 font-bold text-[#07111b]">
                        Continue
                    </button>
                </form>
            </MiniShell>
        );
    return (
        <MiniShell>
            <header>
                <span className="text-xs font-extrabold tracking-[.18em] text-[#5ec5ff] uppercase">
                    Data Deserts
                </span>
                <h1 className="mt-1 text-2xl font-semibold">Choose a country</h1>
                <p className="mt-2 text-sm text-[#9fb0c0]">
                    Signed in as <b className="text-[#e7edf3]">{confirmedName}</b>. You can add
                    countries; only the presenter can remove them.
                </p>
            </header>
            <div className="mt-5 rounded-2xl border border-[#2c3e50] bg-[#172230] p-4">
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search DHS countries…"
                    className="w-full rounded-xl border border-[#3a5065] bg-[#101923] px-4 py-3 text-base"
                />
                <p className="mt-3 text-xs text-[#9fb0c0]">
                    {countries.length}/{MAX_COMPARE_COUNTRIES} countries currently selected
                </p>
                <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto">
                    {available.map((country) => (
                        <button
                            key={country.iso}
                            disabled={countries.length >= MAX_COMPARE_COUNTRIES}
                            onClick={() => add(country.iso)}
                            className="flex w-full items-center justify-between rounded-xl border border-[#2c3e50] bg-[#101923] px-4 py-4 text-left disabled:opacity-35"
                        >
                            <span className="font-semibold">{country.name}</span>
                            <span className="text-sm font-bold text-[#5ec5ff]">Add +</span>
                        </button>
                    ))}
                </div>
            </div>
            <p aria-live="polite" className="mt-4 min-h-5 text-center text-sm text-[#9fb0c0]">
                {message}
            </p>
        </MiniShell>
    );
}

function MiniShell({ children }: { children: React.ReactNode }) {
    return (
        <main className="min-h-[100dvh] bg-[#0f1620] px-4 py-6 text-[#e7edf3]">
            <div className="mx-auto max-w-md">{children}</div>
        </main>
    );
}
