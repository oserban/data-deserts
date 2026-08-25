import { WebMercatorViewport } from '@deck.gl/core';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import data from '../data/datasets.json';
import world from '../data/world.json';
import { withBasePath } from '../lib/base-path';
import {
    controlEngine,
    DEFAULT_STATE,
    MAX_COMPARE_COUNTRIES,
    type MapViewState,
    useWallStore
} from '../lib/realtime';
import { MAP_COLS, SCREEN_HEIGHT, SCREEN_WIDTH, WALL_ROWS } from '../lib/wall-config';

type ControlSearch = { operator: string; token: string };
type ControlAuthorization = {
    status: 'checking' | 'authorized' | 'denied';
    token: string;
    warning: boolean;
};
type Dataset = {
    name: string;
    domain: string;
    color: string;
    records: Record<string, Record<string, number>>;
};
const datasets = data.datasets as Record<string, Dataset>;
const meta = data.meta as {
    datasetOrder: string[];
    categoryOrder: string[];
    yearMin: number;
    yearMax: number;
};
const countryOptions = world.features
    .filter((feature) => Object.values(datasets).some((dataset) => feature.id in dataset.records))
    .map((feature) => ({
        iso: feature.id,
        name: feature.properties.name,
        available: meta.datasetOrder.filter((id) => feature.id in datasets[id].records)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
const dhsCountryOptions = countryOptions.filter((country) => country.iso in datasets.dhs.records);
const quickCountryCount = Math.min(30, dhsCountryOptions.length);
const QUICK_COUNTRIES = Array.from(
    { length: quickCountryCount },
    (_, index) =>
        dhsCountryOptions[
            Math.round(
                (index * (dhsCountryOptions.length - 1)) / Math.max(1, quickCountryCount - 1)
            )
        ]
);
const REGIONS = [
    ['World', 15, 18, 5.2],
    ['Africa', 20, 2, 6.2],
    ['Europe', 15, 52, 6.8],
    ['Asia', 85, 25, 6.1],
    ['Americas', -75, 5, 6],
    ['Oceania', 140, -24, 6.5]
] as const;

export const Route = createFileRoute('/control')({
    validateSearch: (search: Record<string, unknown>): ControlSearch => ({
        operator: typeof search.operator === 'string' ? search.operator : 'A',
        token: typeof search.token === 'string' ? search.token : ''
    }),
    component: ControlPage
});

function ControlPage() {
    const { operator, token } = Route.useSearch();
    const state = useWallStore((value) => value);
    const [countryQuery, setCountryQuery] = useState('');
    const [authorization, setAuthorization] = useState<ControlAuthorization>({
        status: 'checking',
        token: '',
        warning: false
    });
    const [kickingMiniControllers, setKickingMiniControllers] = useState(false);
    const [kickMiniControllersFailed, setKickMiniControllersFailed] = useState(false);
    useEffect(() => {
        let active = true;
        const query = token ? `?token=${encodeURIComponent(token)}` : '';
        void fetch(withBasePath(`/api/control/auth${query}`), { cache: 'no-store' })
            .then(async (response) => {
                const result = (await response.json()) as {
                    authorized?: boolean;
                    warning?: boolean;
                    controlToken?: string;
                };
                if (!active) return;
                if (!response.ok || !result.authorized) {
                    setAuthorization({ status: 'denied', token: '', warning: false });
                    return;
                }
                const effectiveToken = token || result.controlToken || '';
                setAuthorization({
                    status: 'authorized',
                    token: effectiveToken,
                    warning: Boolean(result.warning)
                });
                controlEngine.start(effectiveToken);
            })
            .catch(
                () => active && setAuthorization({ status: 'denied', token: '', warning: false })
            );
        return () => {
            active = false;
        };
    }, [token]);
    const matchingCountry = useMemo(
        () =>
            dhsCountryOptions.find(
                (country) =>
                    country.name.toLocaleLowerCase() === countryQuery.trim().toLocaleLowerCase() ||
                    country.iso === countryQuery.trim().toUpperCase()
            ),
        [countryQuery]
    );
    const toggleDataset = (id: string) =>
        controlEngine.update({
            selectedDatasets: state.selectedDatasets.includes(id)
                ? state.selectedDatasets.filter((candidate) => candidate !== id)
                : [...state.selectedDatasets, id]
        });
    const updateCountries = (countries: string[]) =>
        controlEngine.update({ countries, mapView: fitCountries(countries, state.mapView) });
    const removeCountry = (iso: string) =>
        updateCountries(state.countries.filter((candidate) => candidate !== iso));
    const toggleCountry = (iso: string) => {
        if (state.countries.includes(iso)) return removeCountry(iso);
        if (state.countries.length < MAX_COMPARE_COUNTRIES)
            updateCountries([...state.countries, iso]);
    };
    const pan = (longitude: number, latitude: number) =>
        controlEngine.update({
            mapView: {
                ...state.mapView,
                longitude: state.mapView.longitude + longitude,
                latitude: Math.max(-80, Math.min(80, state.mapView.latitude + latitude))
            }
        });
    const resetDemo = () =>
        controlEngine.update({
            ...DEFAULT_STATE,
            selectedDatasets: [...DEFAULT_STATE.selectedDatasets],
            countries: [],
            countryAttribution: {},
            mapView: { ...DEFAULT_STATE.mapView },
            participants: state.participants
        });
    const kickMiniControllers = async () => {
        if (kickingMiniControllers || !state.participants.length) return;
        setKickingMiniControllers(true);
        setKickMiniControllersFailed(false);
        try {
            const response = await fetch(withBasePath('/api/mini/session'), {
                method: 'DELETE',
                headers: { 'x-control-token': authorization.token }
            });
            if (!response.ok) {
                setKickMiniControllersFailed(true);
                return;
            }
            controlEngine.update({ participants: [] });
        } catch {
            setKickMiniControllersFailed(true);
        } finally {
            setKickingMiniControllers(false);
        }
    };
    if (authorization.status !== 'authorized') {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#0f1620] p-5 text-[#e7edf3]">
                <section className="max-w-lg rounded-xl border border-[#2c3e50] bg-[#172230] p-7 text-center">
                    <h1 className="text-2xl font-semibold">
                        {authorization.status === 'checking'
                            ? 'Authorizing controller…'
                            : 'Controller access denied'}
                    </h1>
                    {authorization.status === 'denied' ? (
                        <p className="mt-3 leading-relaxed text-[#9fb0c0]">
                            This controller URL has a missing or invalid token. Request a valid
                            controller link from the application administrator.
                        </p>
                    ) : null}
                </section>
            </main>
        );
    }
    return (
        <main className="min-h-screen bg-[#0f1620] p-5 text-[#e7edf3]">
            {authorization.warning ? (
                <div className="mb-5 rounded-xl border border-amber-700 bg-amber-950 px-5 py-3 text-sm text-amber-200">
                    <b>Security warning:</b> no controller token is configured. Set{' '}
                    <code>DO_WALL_CONTROL_TOKEN</code> before exposing this application.
                </div>
            ) : null}
            <header className="mb-5 flex flex-col items-start justify-between gap-5 rounded-xl border border-[#2c3e50] bg-[#172230] p-5 lg:flex-row">
                <div>
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-extrabold tracking-[.18em] text-[#5ec5ff] uppercase">
                            Data Deserts
                        </span>
                        <div
                            className={`rounded-full border px-3 py-1 text-xs ${state.connection === 'open' ? 'border-emerald-700 bg-emerald-950 text-emerald-300' : 'border-amber-700 bg-amber-950 text-amber-300'}`}
                        >
                            <i className="mr-2 inline-block size-2 rounded-full bg-current" />
                            {state.connection === 'open' ? 'Connected' : state.connection}
                        </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-4">
                        <h1 className="text-3xl font-semibold">Display controller {operator}</h1>
                        <button
                            type="button"
                            onClick={resetDemo}
                            className="rounded-lg border border-red-500 bg-red-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-950/40 transition-colors hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            Reset demo
                        </button>
                        <button
                            type="button"
                            onClick={() => void kickMiniControllers()}
                            disabled={!state.participants.length || kickingMiniControllers}
                            className="rounded-lg border border-red-700 bg-transparent px-4 py-2 text-sm font-bold text-red-300 transition-colors hover:bg-red-950 disabled:cursor-not-allowed disabled:border-[#3a5065] disabled:text-[#73889b]"
                        >
                            {kickingMiniControllers
                                ? 'Kicking…'
                                : kickMiniControllersFailed
                                  ? 'Kick failed — retry'
                                  : 'Kick mini controllers'}
                        </button>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#9fb0c0]">
                        Data Deserts shows how sector-limited investment can leave little
                        overlapping evidence across ecology, hydrology, agriculture and public
                        health. The wall retains each source's own record units and makes missing
                        coverage visible.
                    </p>
                </div>
                <div className="w-full shrink-0 sm:w-auto">
                    <ControllerMiniQr />
                </div>
            </header>
            <div className="grid items-start gap-5 xl:grid-cols-2">
                <div className="space-y-5">
                    <Panel
                        title="Time window"
                        action={
                            <output className="font-mono text-[#5ec5ff]">
                                {state.yearFrom}–{state.yearTo}
                            </output>
                        }
                    >
                        <YearRange
                            from={state.yearFrom}
                            to={state.yearTo}
                            min={meta.yearMin}
                            max={meta.yearMax}
                            onChange={(yearFrom, yearTo) =>
                                controlEngine.update({ yearFrom, yearTo })
                            }
                        />
                        <div className="flex justify-between text-xs text-[#9fb0c0]">
                            <span>{meta.yearMin}</span>
                            <span>{meta.yearMax}</span>
                        </div>
                    </Panel>
                    <Panel title="Visualisation options">
                        <Switch
                            checked={state.yearlyHistograms}
                            title="Annual time bins"
                            description="Split dataset coverage into one bin per year."
                            onChange={(checked) =>
                                controlEngine.update({ yearlyHistograms: checked })
                            }
                        />
                        <Switch
                            checked={state.groupedByDomain}
                            title="Group by category"
                            description="Combine datasets into ecology, agriculture and public-health sectors."
                            onChange={(checked) =>
                                controlEngine.update({ groupedByDomain: checked })
                            }
                        />
                    </Panel>
                    <details className="group rounded-xl border border-[#2c3e50] bg-[#172230]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
                            <h2 className="text-lg font-semibold">Datasets</h2>
                            <span className="flex items-center gap-3 text-sm text-[#9fb0c0]">
                                <b className="font-normal">
                                    {state.selectedDatasets.length} of {meta.datasetOrder.length}{' '}
                                    selected
                                </b>
                                <i className="text-[#5ec5ff] transition-transform group-open:rotate-180">
                                    ⌄
                                </i>
                            </span>
                        </summary>
                        <div className="border-t border-[#2c3e50] p-5">
                            <div className="mb-4 flex justify-end gap-3 text-sm">
                                <button
                                    className="text-[#5ec5ff]"
                                    onClick={() =>
                                        controlEngine.update({
                                            selectedDatasets: meta.datasetOrder
                                        })
                                    }
                                >
                                    All
                                </button>
                                <button
                                    className="text-[#5ec5ff]"
                                    onClick={() => controlEngine.update({ selectedDatasets: [] })}
                                >
                                    None
                                </button>
                            </div>
                            <div className="space-y-4">
                                {meta.categoryOrder.map((domain) => {
                                    const ids = meta.datasetOrder.filter(
                                        (id) => datasets[id].domain === domain
                                    );
                                    return ids.length ? (
                                        <section key={domain}>
                                            <h3 className="mb-2 text-xs font-extrabold tracking-wider text-[#9fb0c0] uppercase">
                                                {domain}
                                            </h3>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {ids.map((id) => (
                                                    <label
                                                        key={id}
                                                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${state.selectedDatasets.includes(id) ? 'border-[#3a5065] bg-[#172230]' : 'border-[#2c3e50] bg-[#101923] opacity-55'}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={state.selectedDatasets.includes(
                                                                id
                                                            )}
                                                            onChange={() => toggleDataset(id)}
                                                        />
                                                        <i
                                                            className="size-3 rounded"
                                                            style={{
                                                                background: datasets[id].color
                                                            }}
                                                        />
                                                        <span>
                                                            <b className="block text-sm">
                                                                {datasets[id].name}
                                                            </b>
                                                            <small className="text-[#9fb0c0]">
                                                                {
                                                                    Object.keys(
                                                                        datasets[id].records
                                                                    ).length
                                                                }{' '}
                                                                covered countries
                                                            </small>
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </section>
                                    ) : null;
                                })}
                            </div>
                        </div>
                    </details>
                    <details className="group rounded-xl border border-[#2c3e50] bg-[#172230]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
                            <h2 className="text-lg font-semibold">Mini controllers</h2>
                            <span className="flex items-center gap-3 text-sm text-[#9fb0c0]">
                                <b className="font-normal">{state.participants.length} connected</b>
                                <i className="text-[#5ec5ff] transition-transform group-open:rotate-180">
                                    ⌄
                                </i>
                            </span>
                        </summary>
                        <div className="border-t border-[#2c3e50] p-5">
                            {state.participants.length ? (
                                <ul className="space-y-2">
                                    {state.participants.map((participant) => (
                                        <li
                                            key={participant.id}
                                            className="flex items-center justify-between rounded-lg bg-[#101923] px-4 py-3"
                                        >
                                            <span className="font-semibold">
                                                {participant.name}
                                            </span>
                                            <span className="text-xs text-emerald-300">
                                                Connected
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-[#9fb0c0]">
                                    No audience mini controllers are connected.
                                </p>
                            )}
                        </div>
                    </details>
                </div>
                <div className="space-y-5">
                    <Panel
                        title="Map navigation"
                        action={
                            <output className="text-sm">
                                Zoom{' '}
                                <b className="font-mono text-[#5ec5ff]">
                                    {state.mapView.zoom.toFixed(1)}
                                </b>
                            </output>
                        }
                    >
                        <div className="grid grid-cols-[auto_1fr] gap-5">
                            <div className="grid grid-cols-3 gap-2">
                                <span />
                                <NavButton label="↑" onClick={() => pan(0, 7)} />
                                <span />
                                <NavButton label="←" onClick={() => pan(-10, 0)} />
                                <NavButton
                                    label="•"
                                    onClick={() =>
                                        controlEngine.update({
                                            mapView: {
                                                longitude: 15,
                                                latitude: 18,
                                                zoom: 5.2,
                                                bearing: 0,
                                                pitch: 0
                                            }
                                        })
                                    }
                                />
                                <NavButton label="→" onClick={() => pan(10, 0)} />
                                <NavButton
                                    label="−"
                                    onClick={() =>
                                        controlEngine.update({
                                            mapView: {
                                                ...state.mapView,
                                                zoom: Math.max(4, state.mapView.zoom - 0.5)
                                            }
                                        })
                                    }
                                />
                                <NavButton label="↓" onClick={() => pan(0, -7)} />
                                <NavButton
                                    label="+"
                                    onClick={() =>
                                        controlEngine.update({
                                            mapView: {
                                                ...state.mapView,
                                                zoom: Math.min(9, state.mapView.zoom + 0.5)
                                            }
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <div className="flex flex-wrap gap-2">
                                    {REGIONS.map(([label, longitude, latitude, zoom]) => (
                                        <button
                                            key={label}
                                            className="rounded-lg border border-[#3a5065] bg-[#101923] px-3 py-2 text-sm hover:border-[#5ec5ff]"
                                            onClick={() =>
                                                controlEngine.update({
                                                    mapView: {
                                                        longitude,
                                                        latitude,
                                                        zoom,
                                                        bearing: 0,
                                                        pitch: 0
                                                    }
                                                })
                                            }
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <label className="mt-4 block text-sm">
                                    Zoom level
                                    <input
                                        className="mt-2 w-full accent-[#5ec5ff]"
                                        type="range"
                                        min="4"
                                        max="9"
                                        step=".1"
                                        value={state.mapView.zoom}
                                        onChange={(event) =>
                                            controlEngine.update({
                                                mapView: {
                                                    ...state.mapView,
                                                    zoom: Number(event.target.value)
                                                }
                                            })
                                        }
                                    />
                                </label>
                            </div>
                        </div>
                    </Panel>
                    <Panel
                        title="Countries"
                        action={
                            <div className="flex items-center gap-3 text-sm">
                                <span className="text-[#9fb0c0]">
                                    {state.countries.length}/{MAX_COMPARE_COUNTRIES}
                                </span>
                                <button
                                    className="text-[#5ec5ff] disabled:opacity-40"
                                    disabled={!state.countries.length}
                                    onClick={() => controlEngine.update({ countries: [] })}
                                >
                                    Clear all
                                </button>
                            </div>
                        }
                    >
                        <div className="flex gap-2">
                            <input
                                list="wall-country-list"
                                value={countryQuery}
                                onChange={(event) => setCountryQuery(event.target.value)}
                                placeholder="Country name…"
                                className="min-w-0 flex-1 rounded-lg border border-[#3a5065] bg-[#101923] px-3 py-2"
                            />
                            <button
                                disabled={
                                    !matchingCountry ||
                                    state.countries.includes(matchingCountry.iso) ||
                                    state.countries.length >= MAX_COMPARE_COUNTRIES
                                }
                                onClick={() => {
                                    if (matchingCountry) {
                                        toggleCountry(matchingCountry.iso);
                                        setCountryQuery('');
                                    }
                                }}
                                className="rounded-lg bg-[#5ec5ff] px-4 py-2 font-semibold text-[#07111b] disabled:opacity-40"
                            >
                                Add country
                            </button>
                        </div>
                        <datalist id="wall-country-list">
                            {dhsCountryOptions.map((country) => (
                                <option
                                    key={`${country.iso}-${country.name}`}
                                    value={country.name}
                                />
                            ))}
                        </datalist>
                        <h3 className="mt-5 text-sm font-semibold">Selected countries</h3>
                        <div className="mt-2 grid min-h-9 gap-2 sm:grid-cols-2">
                            {state.countries.length ? (
                                state.countries.map((iso) => (
                                    <div
                                        key={iso}
                                        className="flex items-center justify-between gap-3 rounded-lg border border-[#5ec5ff] bg-[#17334a] px-3 py-2 text-sm"
                                    >
                                        <span className="truncate">
                                            {countryOptions.find((country) => country.iso === iso)
                                                ?.name ?? iso}
                                        </span>
                                        <button
                                            onClick={() => removeCountry(iso)}
                                            className="shrink-0 font-semibold text-[#5ec5ff]"
                                            aria-label={`Remove ${countryOptions.find((country) => country.iso === iso)?.name ?? iso}`}
                                        >
                                            Remove ×
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <small className="text-[#9fb0c0]">No countries selected</small>
                            )}
                        </div>
                        {state.countries.length >= MAX_COMPARE_COUNTRIES ? (
                            <p className="mt-3 text-sm text-amber-300">
                                The comparison is limited to {MAX_COMPARE_COUNTRIES} countries.
                                Remove one to add another.
                            </p>
                        ) : null}
                        <h3 className="mt-5 text-sm font-semibold">Quick navigation</h3>
                        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {QUICK_COUNTRIES.map((country) => {
                                const selected = state.countries.includes(country.iso);
                                const atLimit =
                                    state.countries.length >= MAX_COMPARE_COUNTRIES && !selected;
                                return (
                                    <button
                                        key={country.iso}
                                        title={
                                            atLimit
                                                ? `Remove a country before adding ${country.name}`
                                                : `${country.available.length} datasets with records`
                                        }
                                        disabled={atLimit}
                                        onClick={() => toggleCountry(country.iso)}
                                        className={`rounded-lg border px-2 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-35 ${selected ? 'border-[#5ec5ff] bg-[#17334a]' : 'border-[#2c3e50] bg-[#101923]'}`}
                                    >
                                        <b className="block truncate">{country.name}</b>
                                        <span className="text-[#9fb0c0]">
                                            {country.available.length} sources
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </Panel>
                </div>
            </div>
        </main>
    );
}

function Panel({
    title,
    action,
    children
}: {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-xl border border-[#2c3e50] bg-[#172230] p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold">{title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}
function YearRange({
    from,
    to,
    min,
    max,
    onChange
}: {
    from: number;
    to: number;
    min: number;
    max: number;
    onChange: (from: number, to: number) => void;
}) {
    const span = Math.max(1, max - min);
    const start = ((from - min) / span) * 100;
    const end = ((to - min) / span) * 100;
    return (
        <div
            className="year-range mb-1"
            style={
                { '--range-start': `${start}%`, '--range-end': `${end}%` } as React.CSSProperties
            }
        >
            <div className="year-range__track" />
            <div className="year-range__selection" />
            <label className="sr-only" htmlFor="year-from">
                First year
            </label>
            <input
                id="year-from"
                aria-valuetext={`First year ${from}`}
                type="range"
                min={min}
                max={to}
                value={from}
                onChange={(event) => onChange(Number(event.target.value), to)}
            />
            <label className="sr-only" htmlFor="year-to">
                Last year
            </label>
            <input
                id="year-to"
                aria-valuetext={`Last year ${to}`}
                type="range"
                min={from}
                max={max}
                value={to}
                onChange={(event) => onChange(from, Number(event.target.value))}
            />
        </div>
    );
}

function ControllerMiniQr() {
    const [invitation, setInvitation] = useState<{
        svg: string;
        ttlSeconds: number;
    } | null>(null);

    useEffect(() => {
        let active = true;
        let timer: number | undefined;
        const refresh = async () => {
            try {
                const response = await fetch(withBasePath('/api/mini/invite'), {
                    cache: 'no-store'
                });
                if (!response.ok || !active) return;
                const next = (await response.json()) as typeof invitation;
                if (!next) return;
                setInvitation(next);
                timer = window.setTimeout(refresh, Math.max(3_000, next.ttlSeconds * 750));
            } catch {
                timer = window.setTimeout(refresh, 5_000);
            }
        };
        void refresh();
        return () => {
            active = false;
            if (timer) window.clearTimeout(timer);
        };
    }, []);

    return (
        <aside className="flex items-center gap-3 rounded-xl border border-[#3a5065] bg-[#101923] p-2 pr-4">
            <div
                className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: invitation?.svg ?? '' }}
            />
            <div className="min-w-28">
                <b className="block text-sm text-[#5ec5ff]">Mini controller</b>
                <span className="mt-1 block text-xs leading-relaxed text-[#9fb0c0]">
                    Scan to choose a country
                </span>
            </div>
        </aside>
    );
}

function Switch({
    checked,
    title,
    description,
    onChange
}: {
    checked: boolean;
    title: string;
    description: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="mb-3 flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-[#101923] p-3 last:mb-0">
            <span>
                <b className="block text-sm">{title}</b>
                <small className="text-[#9fb0c0]">{description}</small>
            </span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
            />
        </label>
    );
}
function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="size-10 rounded-lg border border-[#3a5065] bg-[#101923] text-lg hover:border-[#5ec5ff]"
        >
            {label}
        </button>
    );
}

function fitCountries(countries: string[], fallback: MapViewState): MapViewState {
    const points = countries
        .map((iso) => countryOptions.find((country) => country.iso === iso))
        .filter(Boolean)
        .map((country) => {
            const feature = world.features.find((candidate) => candidate.id === country!.iso)!;
            return featureCenter(feature.geometry.coordinates);
        });
    if (!points.length) return fallback;
    if (points.length === 1)
        return { longitude: points[0][0], latitude: points[0][1], zoom: 7.2, bearing: 0, pitch: 0 };
    const regularSpan =
        Math.max(...points.map(([longitude]) => longitude)) -
        Math.min(...points.map(([longitude]) => longitude));
    const adjusted =
        regularSpan > 180
            ? points.map(
                  ([longitude, latitude]) =>
                      [longitude < 0 ? longitude + 360 : longitude, latitude] as [number, number]
              )
            : points;
    const longitudes = adjusted.map(([longitude]) => longitude),
        latitudes = adjusted.map(([, latitude]) => latitude);
    const fitted = new WebMercatorViewport({
        width: MAP_COLS * SCREEN_WIDTH,
        height: WALL_ROWS * SCREEN_HEIGHT
    }).fitBounds(
        [
            [Math.min(...longitudes), Math.min(...latitudes)],
            [Math.max(...longitudes), Math.max(...latitudes)]
        ],
        { padding: 520, maxZoom: 7.2 }
    );
    return {
        longitude: fitted.longitude > 180 ? fitted.longitude - 360 : fitted.longitude,
        latitude: fitted.latitude,
        zoom: fitted.zoom,
        bearing: 0,
        pitch: 0
    };
}

function featureCenter(coordinates: unknown): [number, number] {
    const points: number[][] = [];
    const visit = (value: unknown) => {
        if (
            Array.isArray(value) &&
            value.length >= 2 &&
            typeof value[0] === 'number' &&
            typeof value[1] === 'number'
        )
            points.push(value as number[]);
        else if (Array.isArray(value)) value.forEach(visit);
    };
    visit(coordinates);
    const longitudes = points.map((point) => point[0]),
        latitudes = points.map((point) => point[1]);
    return [
        (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
        (Math.min(...latitudes) + Math.max(...latitudes)) / 2
    ];
}
