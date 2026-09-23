import { WebMercatorViewport } from '@deck.gl/core';
import { Layer, Map as MapLibreMap, Marker, Source, type LayerProps } from '@vis.gl/react-maplibre';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';

import data from '../../data/datasets.json';
import world from '../../data/world.json';
import { withBasePath } from '../../lib/base-path';
import { DATASET_REFERENCE } from '../../lib/dataset-reference';
import {
    MAX_COMPARE_COUNTRIES,
    type MapViewState,
    screenEngine,
    type ScreenStoreState,
    useWallStore
} from '../../lib/realtime';
import {
    datasetsForEstimates,
    modelForEstimates,
    scoreModel,
    type AgricultureMetric,
    type MetricResult
} from '../../lib/score-model';
import {
    DATASETS_COLS,
    DATASETS_START_COL,
    DETAIL_COLS,
    DETAIL_START_COL,
    MAP_COLS,
    MAP_START_COL,
    PROJECT_COLS,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    WALL_ROWS
} from '../../lib/wall-config';

import 'maplibre-gl/dist/maplibre-gl.css';

type Dataset = {
    name: string;
    domain: string;
    color: string;
    unit?: string;
    description?: string;
    records: Record<string, Record<string, number>>;
    estimatedRecords?: Record<string, Record<string, number>>;
    nutritionDefinition?: string;
    effective_resolution_km?: Record<string, Record<string, Record<string, number | null>>>;
    spatialSupport?: { display: string };
    surveyYears?: Record<
        string,
        Array<{
            year: number;
            label: string;
            surveyCount: number;
            surveyTypes: string[];
            nutrition: true | null;
            nutritionTopics: string[];
        }>
    >;
};
const datasets = data.datasets as Record<string, Dataset>;
const meta = data.meta as {
    datasetOrder: string[];
    categoryOrder: string[];
    yearMin: number;
    yearMax: number;
};
const MAP_STYLE = {
    version: 8 as const,
    sources: {},
    layers: [{ id: 'ocean', type: 'background' as const, paint: { 'background-color': '#0a2233' } }]
};
const fillLayer: LayerProps = {
    id: 'countries',
    source: 'data-deserts-coverage',
    type: 'fill',
    paint: { 'fill-color': '#0d141d', 'fill-opacity': 0.72 }
};
const lineLayer: LayerProps = {
    id: 'country-lines',
    source: 'data-deserts-coverage',
    type: 'line',
    paint: { 'line-color': '#40566a', 'line-width': 1.5, 'line-opacity': 1 }
};
const dhsFillLayer: LayerProps = {
    id: 'dhs-countries',
    source: 'data-deserts-coverage',
    type: 'fill',
    filter: ['==', ['get', 'inScope'], true],
    paint: { 'fill-color': '#263443', 'fill-opacity': 0.72 }
};
const dhsLineLayer: LayerProps = {
    id: 'dhs-country-lines',
    source: 'data-deserts-coverage',
    type: 'line',
    filter: ['==', ['get', 'inScope'], true],
    paint: { 'line-color': '#8498ac', 'line-width': 3, 'line-opacity': 1 }
};
const selectedLineLayer: LayerProps = {
    id: 'selected-country-lines',
    source: 'data-deserts-coverage',
    type: 'line',
    filter: ['==', ['get', 'selected'], true],
    paint: { 'line-color': '#5ec5ff', 'line-width': 6, 'line-opacity': 1 }
};

export function WallScreen({ c, r }: { c: number; r: number }) {
    const [client, setClient] = useState(false);
    const [scale, setScale] = useState(1);
    const state = useWallStore((value) => value);
    useEffect(() => {
        screenEngine.start();
        setClient(true);
        const resize = () =>
            setScale(
                Math.min(window.innerWidth / SCREEN_WIDTH, window.innerHeight / SCREEN_HEIGHT)
            );
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);
    const coverage = useMemo(
        () => buildCoverage(state),
        [
            state.yearFrom,
            state.yearTo,
            state.selectedDatasets,
            state.countries,
            state.includeLsmsEstimates
        ]
    );
    const isProject = c < PROJECT_COLS;
    const isDatasets = c >= DATASETS_START_COL && c < DATASETS_START_COL + DATASETS_COLS;
    const isMap = c >= MAP_START_COL && c < MAP_START_COL + MAP_COLS;
    const isDetail = c >= DETAIL_START_COL;
    const localView = useMemo(
        () => deriveScreenMapView(state.mapView, c - MAP_START_COL, r),
        [state.mapView, c, r]
    );
    return (
        <main className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#0f1620]">
            <div
                className="relative shrink-0 overflow-hidden bg-[#0f1620]"
                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, transform: `scale(${scale})` }}
            >
                {isProject ? <ProjectTile c={c} r={r} /> : null}
                {isDatasets ? <DatasetsTile c={c} r={r} /> : null}
                {isMap && client ? (
                    <MapLibreMap
                        reuseMaps
                        attributionControl={false}
                        mapStyle={MAP_STYLE}
                        longitude={localView.longitude}
                        latitude={localView.latitude}
                        zoom={localView.zoom}
                        bearing={localView.bearing}
                        pitch={localView.pitch}
                        style={{ width: '100%', height: '100%' }}
                    >
                        <CoverageLayers coverage={coverage} />
                        <MapDonuts state={state} zoom={localView.zoom} />
                    </MapLibreMap>
                ) : null}
                {isMap && c === MAP_START_COL && r === 0 ? <MapLegend state={state} /> : null}
                {isMap && c === MAP_START_COL + MAP_COLS - 1 && r === 0 ? (
                    <MiniControllerQr />
                ) : null}
                {isDetail ? <DetailsTile c={c} r={r} state={state} /> : null}
            </div>
        </main>
    );
}

function CoverageLayers({ coverage }: { coverage: ReturnType<typeof buildCoverage> }) {
    return createElement(
        Source,
        { id: 'data-deserts-coverage', type: 'geojson', data: coverage as never, generateId: true },
        createElement(Layer, { ...fillLayer, key: fillLayer.id }),
        createElement(Layer, { ...lineLayer, key: lineLayer.id }),
        createElement(Layer, { ...dhsFillLayer, key: dhsFillLayer.id }),
        createElement(Layer, { ...dhsLineLayer, key: dhsLineLayer.id }),
        createElement(Layer, { ...selectedLineLayer, key: selectedLineLayer.id })
    );
}

function ProjectTile({ c, r }: { c: number; r: number }) {
    const animationRoot = useRef<HTMLDivElement>(null);
    const [animationSynced, setAnimationSynced] = useState(false);
    useEffect(() => {
        let active = true;
        const synchronize = async () => {
            const requestedAt = performance.now();
            try {
                const response = await fetch(withBasePath('/api/time'), { cache: 'no-store' });
                if (!response.ok || !active) return;
                const { now } = (await response.json()) as { now: number };
                const serverNow = now + (performance.now() - requestedAt) / 2;
                animationRoot.current?.getAnimations({ subtree: true }).forEach((animation) => {
                    animation.currentTime = serverNow;
                });
                setAnimationSynced(true);
            } catch {
                setAnimationSynced(true);
            }
        };
        void synchronize();
        const timer = window.setInterval(synchronize, 30_000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);
    return (
        <div
            ref={animationRoot}
            className={`relative flex flex-col overflow-hidden bg-[radial-gradient(120%_45%_at_50%_0%,#17334a_0%,#0f1620_70%)] px-32 py-28 text-[#e7edf3] ${animationSynced ? 'wall-animation-synced' : 'wall-animation-syncing'}`}
            style={{
                width: PROJECT_COLS * SCREEN_WIDTH,
                height: WALL_ROWS * SCREEN_HEIGHT,
                transform: `translate(${-c * SCREEN_WIDTH}px,${-r * SCREEN_HEIGHT}px)`
            }}
        >
            <header>
                <span className="text-3xl font-extrabold tracking-[.18em] text-[#5ec5ff] uppercase">
                    Data Deserts
                </span>
                <h1 className="mt-5 max-w-[3300px] text-[150px] leading-[.96] font-bold tracking-[-.045em]">
                    Where evidence is missing, decisions become harder.
                </h1>
                <p className="mt-10 max-w-[3250px] text-[42px] leading-[1.45] text-[#9fb0c0]">
                    Data Deserts reveals uneven geographic and temporal coverage of ecological,
                    agricultural, hydrological and public-health data—and asks how transparent,
                    responsible AI might identify gaps without disguising uncertainty as knowledge.
                </p>
            </header>
            <section className="mt-20 grid grid-cols-[.8fr_1.7fr] gap-10">
                <div className="rounded-[30px] border border-[#2c3e50] bg-[#172230] p-12">
                    <span className="text-3xl font-bold tracking-wider text-[#5ec5ff] uppercase">
                        The central idea
                    </span>
                    <h2 className="mt-6 text-6xl font-semibold">
                        From scattered observations to visible gaps
                    </h2>
                    <p className="mt-8 text-3xl leading-relaxed text-[#9fb0c0]">
                        Living systems connect biodiversity, food production, water, climate and
                        human health. Gaps in one domain limit our understanding of the whole
                        system.
                    </p>
                    <div className="mt-12 grid grid-cols-2 gap-5 text-3xl">
                        <Domain color="#55c271" label="Ecology" />
                        <Domain color="#e89b3c" label="Agriculture" />
                        <Domain color="#38aee8" label="Hydrology" />
                        <Domain color="#e45c5c" label="Public health" />
                    </div>
                    <div className="mt-12 border-t border-[#2c3e50] pt-8 text-2xl leading-relaxed text-[#9fb0c0]">
                        Observed records reveal coverage. Dark areas remain data deserts.
                        AI-supported estimates must retain provenance and visible uncertainty.
                    </div>
                </div>
                <ConceptGraphic />
            </section>
            <section className="absolute top-[2260px] right-32 left-32 grid h-[780px] grid-cols-4 gap-8">
                {[
                    [
                        '01',
                        'What the project does',
                        `Combines ${meta.datasetOrder.length} sources into a country-year view. Radial and temporal summaries make overlap—and its absence—visible.`
                    ],
                    [
                        '02',
                        'Why gaps matter',
                        'Sparse or disconnected records can hide change, weaken comparisons and leave communities under-represented.'
                    ],
                    [
                        '03',
                        'Where AI may help',
                        'AI can identify high-value places and years for collection, connect compatible sources and expose testable estimates.'
                    ],
                    [
                        '04',
                        'What AI cannot do',
                        'Predictions are not observations. Responsible use must preserve provenance, bias and uncertainty.'
                    ]
                ].map(([number, title, copy]) => (
                    <article
                        key={number}
                        className="relative rounded-[30px] border border-[#2c3e50] bg-[#172230] p-12"
                    >
                        <b className="absolute top-8 right-10 text-8xl text-white/10">{number}</b>
                        <h3 className="max-w-[80%] text-5xl leading-tight font-semibold">
                            {title}
                        </h3>
                        <p className="mt-8 text-4xl leading-relaxed text-[#9fb0c0]">{copy}</p>
                    </article>
                ))}
            </section>
            <section className="absolute top-[3290px] right-8 bottom-20 left-8 grid grid-cols-2 gap-10">
                <div className="grid grid-rows-[auto_1fr_auto] rounded-[34px] border border-[#2c3e50] bg-[#172230]/95 p-12 shadow-2xl">
                    <h2 className="text-left text-5xl font-semibold">Partner universities</h2>
                    <div className="flex flex-col items-start justify-evenly">
                        <span className="flex h-[190px] w-[60%] items-center justify-center rounded-2xl bg-[#101923] p-8">
                            <img
                                className="h-32 w-full object-contain brightness-0 invert"
                                src={withBasePath('/project/imperial-college-london.png')}
                                alt="Imperial College London"
                            />
                        </span>
                        <span className="flex h-[190px] w-[60%] items-center justify-center rounded-2xl bg-white p-8">
                            <img
                                className="h-32 w-full object-contain"
                                src={withBasePath('/project/politecnico-di-milano.svg')}
                                alt="Politecnico di Milano"
                            />
                        </span>
                    </div>
                    <p className="text-3xl leading-relaxed text-[#9fb0c0]">
                        A collaboration developed through the European Talent Academy 2025.
                    </p>
                </div>
                <div className="grid grid-rows-[auto_1fr] rounded-[34px] border border-[#2c3e50] bg-[#172230]/95 p-12 shadow-2xl">
                    <h2 className="text-left text-5xl font-semibold">Project team</h2>
                    <div className="grid grid-cols-4 gap-10 self-center">
                        <Person
                            image="nikolas-galli.jpg"
                            name="Nikolas Galli"
                            affiliation="Politecnico di Milano"
                        />
                        <Person
                            image="paraskevi-seferidi.jpg"
                            name="Paraskevi Seferidi"
                            affiliation="Imperial College London"
                        />
                        <Person
                            image="ovidiu-serban.jpg"
                            name="Ovidiu Șerban"
                            affiliation="Imperial College London"
                        />
                        <Person
                            image="jessica-williams.jpg"
                            name="Jessica Williams"
                            affiliation="Imperial College London"
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

function Domain({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-4">
            <i className="size-5 rounded-full" style={{ background: color }} />
            {label}
        </span>
    );
}
function Person({
    image,
    name,
    affiliation
}: {
    image: string;
    name: string;
    affiliation: string;
}) {
    return (
        <div>
            <img
                className="h-[300px] w-full rounded-2xl object-cover object-[center_28%]"
                src={withBasePath(`/project/${image}`)}
                alt={name}
            />
            <b className="mt-3 block text-2xl">{name}</b>
            <span className="text-xl text-[#9fb0c0]">{affiliation}</span>
        </div>
    );
}

function ConceptGraphic() {
    const points = [
        [155, 150],
        [205, 165],
        [260, 145],
        [325, 270],
        [365, 390],
        [500, 145],
        [565, 250],
        [645, 245],
        [700, 125],
        [875, 145],
        [950, 175],
        [1030, 205],
        [905, 360],
        [970, 360],
        [1025, 405]
    ];
    return (
        <div className="relative overflow-hidden rounded-[30px] border border-[#2c3e50] bg-[#131d29] p-8">
            <svg
                className="h-full w-full"
                viewBox="0 0 1200 600"
                role="img"
                aria-label="Animated Data Deserts concept map"
            >
                <defs>
                    <radialGradient id="void">
                        <stop offset="0" stopColor="#070b10" stopOpacity=".95" />
                        <stop offset="1" stopColor="#0b1118" stopOpacity="0" />
                    </radialGradient>
                    <filter id="conceptGlow">
                        <feGaussianBlur stdDeviation="5" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <g className="concept-land" fill="#1a2d3b" stroke="#567084" strokeWidth="3">
                    <path d="M116 175 150 123l76-31 89 14 52 41-20 39-62 9-30 38-51-8-30-35-42 8Z" />
                    <path d="m310 246 54 14 39 47-5 72-35 102-31-19-20-80-30-60Z" />
                    <path d="m487 136 40-28 58 8 24 29-24 30-52-8-31 17-34-19Z" />
                    <path d="m525 201 74-18 65 35 13 69-42 96-49-13-29-72-51-53Z" />
                    <path d="m620 135 87-46 150 20 73 42 104 5 55 42-30 39-91-7-51 36-76-17-61 24-82-37-47-38Z" />
                    <path d="m886 344 68-25 77 25 23 56-62 40-85-16-38-42Z" />
                </g>
                <g
                    className="concept-network"
                    stroke="#b58cff"
                    strokeWidth="2"
                    strokeDasharray="8 10"
                >
                    <path d="M155 150 325 270 565 250 700 125 875 145 1030 205" fill="none" />
                    <path d="M205 165 365 390 645 245 905 360 1025 405" fill="none" />
                    <path d="M500 145 790 180 970 360" fill="none" />
                </g>
                <g filter="url(#conceptGlow)">
                    {points.map(([x, y], index) => (
                        <circle
                            key={index}
                            cx={x}
                            cy={y}
                            r={index % 3 ? 8 : 12}
                            fill={['#55c271', '#e89b3c', '#e45c5c', '#5ec5ff'][index % 4]}
                            className={
                                index < 8
                                    ? 'concept-observation'
                                    : 'concept-observation concept-observation-emerging'
                            }
                            style={{ animationDelay: `${-index * 0.63}s` }}
                        />
                    ))}
                </g>
                <g>
                    <ellipse
                        className="concept-void"
                        cx="350"
                        cy="340"
                        rx="55"
                        ry="78"
                        fill="url(#void)"
                        stroke="#8192a5"
                        strokeDasharray="8 10"
                    />
                    <ellipse
                        className="concept-void"
                        cx="790"
                        cy="180"
                        rx="90"
                        ry="55"
                        fill="url(#void)"
                        stroke="#8192a5"
                        strokeDasharray="8 10"
                        style={{ animationDelay: '-2s' }}
                    />
                </g>
                <g filter="url(#conceptGlow)">
                    <circle className="concept-inferred" cx="350" cy="340" r="13" fill="#b58cff" />
                    <circle
                        className="concept-inferred"
                        cx="790"
                        cy="180"
                        r="13"
                        fill="#b58cff"
                        style={{ animationDelay: '-2s' }}
                    />
                    <circle
                        className="concept-inferred"
                        cx="605"
                        cy="285"
                        r="10"
                        fill="#b58cff"
                        style={{ animationDelay: '-4s' }}
                    />
                </g>
                <g fill="none" stroke="#b58cff" strokeWidth="3" strokeDasharray="8 10">
                    <circle className="concept-uncertainty" cx="350" cy="340" r="78" />
                    <circle
                        className="concept-uncertainty"
                        cx="790"
                        cy="180"
                        r="112"
                        style={{ animationDelay: '-2s' }}
                    />
                </g>
                <text
                    x="600"
                    y="555"
                    fill="#b58cff"
                    fontSize="28"
                    fontWeight="800"
                    textAnchor="middle"
                    letterSpacing="7"
                >
                    MAKE GAPS VISIBLE
                </text>
            </svg>
        </div>
    );
}

function DatasetsTile({ c, r }: { c: number; r: number }) {
    const localColumn = c - DATASETS_START_COL;
    const cardRows = Array.from({ length: Math.ceil(meta.datasetOrder.length / 2) }, (_, row) =>
        meta.datasetOrder.slice(row * 2, row * 2 + 2)
    );
    // Six two-card rows fit into the four physical wall rows as 1 + 2 + 2 + 1.
    // Every visible card begins and ends inside a single 1920×1080 display.
    const rowLayout = [
        { top: 420, scale: 0.78 },
        { top: 1112, scale: 0.6 },
        { top: 1636, scale: 0.6 },
        { top: 2192, scale: 0.6 },
        { top: 2716, scale: 0.6 },
        { top: 3240, scale: 0.78 }
    ];
    return (
        <div
            className="relative overflow-hidden bg-[radial-gradient(120%_55%_at_50%_0%,#17334a_0%,#0f1620_68%)] px-24 py-24 text-[#e7edf3]"
            style={{
                width: DATASETS_COLS * SCREEN_WIDTH,
                height: WALL_ROWS * SCREEN_HEIGHT,
                transform: `translate(${-localColumn * SCREEN_WIDTH}px,${-r * SCREEN_HEIGHT}px)`
            }}
        >
            <header>
                <span className="text-3xl font-extrabold tracking-[.18em] text-[#5ec5ff] uppercase">
                    Source reference
                </span>
                <h1 className="mt-4 text-[128px] leading-none font-bold tracking-[-.04em]">
                    {meta.datasetOrder.length} datasets, {meta.categoryOrder.length} evidence
                    domains.
                </h1>
                <p className="mt-7 text-3xl leading-relaxed text-[#9fb0c0]">
                    Coverage summaries preserve each provider's units, licences and limitations. Bar
                    height uses a logarithmic scale. Missing country-year records mean missing data,
                    not confirmed zero observations.
                </p>
            </header>
            <div className="absolute top-0 right-24 left-24">
                {cardRows.map((ids, row) => {
                    const layout = rowLayout[row];
                    return (
                        <div
                            key={ids.join('-')}
                            className="absolute grid w-full grid-cols-2 gap-7"
                            style={{ top: layout.top }}
                        >
                            {ids.map((id) => (
                                <div key={id} style={{ height: 820 * layout.scale }}>
                                    <DatasetCard id={id} scale={layout.scale} />
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
            <footer className="absolute top-[3950px] right-24 left-24 rounded-xl border-l-8 border-[#f0bd4f] bg-[#131d29] px-8 py-6 text-2xl text-[#9fb0c0]">
                Missing country-year records mean missing data, not confirmed zero observations.
                Always consult the original provider before reuse.
            </footer>
        </div>
    );
}

function DatasetCard({ id, scale }: { id: string; scale: number }) {
    const includeEstimates = useWallStore((state) => state.includeLsmsEstimates);
    const dataset = (datasetsForEstimates(includeEstimates) as Record<string, Dataset>)[id];
    const reference = DATASET_REFERENCE[id];
    return (
        <article
            className="relative h-[820px] overflow-hidden rounded-[26px] border border-[#2c3e50] bg-[linear-gradient(145deg,#172230,#131d29)] p-9 pl-12"
            style={{
                borderLeftColor: dataset.color,
                borderLeftWidth: 10,
                width: `${100 / scale}%`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left'
            }}
        >
            <div className="flex items-center justify-between">
                <strong className="text-5xl" style={{ color: dataset.color }}>
                    {dataset.name}
                </strong>
                <span className="rounded-full border border-[#2c3e50] bg-[#0e1722] px-5 py-2 text-xl font-bold tracking-wider text-[#9fb0c0] uppercase">
                    {dataset.domain}
                </span>
            </div>
            <h2 className="mt-4 h-24 text-3xl leading-snug font-semibold">{reference.title}</h2>
            <Histogram dataset={dataset} />
            <dl className="mt-5 space-y-4 text-2xl">
                <ReferenceRow label="Provider" value={reference.provider} />
                <ReferenceRow
                    label="Description"
                    value={
                        id === 'lsms'
                            ? (dataset.description ?? reference.description)
                            : reference.description
                    }
                />
                <ReferenceRow label="Licence" value={reference.licence} />
                <ReferenceRow label="Source" value={reference.source} />
            </dl>
        </article>
    );
}
function ReferenceRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[180px_1fr] gap-5 border-t border-[#2c3e50]/70 pt-4">
            <dt className="font-extrabold tracking-wider text-[#9fb0c0] uppercase">{label}</dt>
            <dd className="leading-snug">{value}</dd>
        </div>
    );
}
function Histogram({ dataset }: { dataset: Dataset }) {
    const totals: Record<number, number> = {};
    Object.values(dataset.records).forEach((years) =>
        Object.entries(years).forEach(
            ([year, count]) => (totals[Number(year)] = (totals[Number(year)] ?? 0) + Number(count))
        )
    );
    const years = Object.keys(totals)
        .map(Number)
        .sort((a, b) => a - b);
    if (!years.length)
        return (
            <p className="mt-5 rounded-2xl bg-[#0e1722] p-5 text-2xl text-[#9fb0c0]">
                Verified reporting counts are unavailable.
            </p>
        );
    const first = years[0],
        last = years.at(-1) ?? first;
    const maximum = Math.max(1, ...Object.values(totals));
    const all = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const width = 1000 / all.length;
    return (
        <div className="mt-5 rounded-2xl border border-[#2c3e50] bg-[#0e1722] p-5">
            <div className="flex justify-between text-xl">
                <b>Global {dataset.unit ?? 'records'} by year</b>
                <span className="text-[#9fb0c0]">
                    {Object.values(totals)
                        .reduce((a, b) => a + b, 0)
                        .toLocaleString()}{' '}
                    {dataset.unit ?? 'records'}
                </span>
            </div>
            <svg className="mt-3 h-28 w-full" viewBox="0 0 1000 110">
                {all.map((year, index) => {
                    const height = totals[year]
                        ? (Math.log10(totals[year] + 1) / Math.log10(maximum + 1)) * 105
                        : 0;
                    return (
                        <rect
                            key={year}
                            x={index * width + 1}
                            y={110 - height}
                            width={Math.max(1, width - 2)}
                            height={height}
                            fill={dataset.color}
                            opacity=".84"
                        />
                    );
                })}
            </svg>
            <div className="flex justify-between text-lg text-[#9fb0c0]">
                <span>{first}</span>
                <span>{last}</span>
            </div>
        </div>
    );
}

type DonutSeries = {
    id: string;
    keys: string[];
    selected: boolean;
    label: string;
    code: string;
    color: string;
    crop?: string;
    hydro?: string;
};
const MARKER_POSITIONS: Record<string, [number, number]> = { RUS: [90, 61.5], USA: [-98.6, 39.8] };
const DATASET_CODES: Record<string, string> = {
    biotime: 'BT',
    living_planet: 'LPD',
    predicts: 'PRED',
    gbif: 'GBIF',
    lsms_isa: 'ISA',
    agriculture_maps: 'AGRI',
    hydro_maps: 'HYD',
    grdc: 'GRDC',
    dhs: 'DHS',
    mics: 'MICS',
    lsms: 'LSMS'
};
const DOMAIN_CODES: Record<string, string> = {
    Ecology: 'ECO',
    Agriculture: 'AGRI',
    Hydrology: 'HYD',
    'Public Health': 'HEALTH'
};
const CROP_CODES: Record<string, string> = {
    wheat: 'WHT',
    rice: 'RICE',
    maize: 'MAIZ',
    barley: 'BAR',
    sorghum: 'SORG',
    potato: 'POT',
    cassava: 'CASS',
    soybean: 'SOY',
    groundnut: 'GND',
    oil_palm: 'OIL',
    sunflower: 'SUN',
    rapeseed: 'RAPE',
    sugarcane: 'CANE',
    sugarbeet: 'BEET',
    cotton: 'COT'
};
const HYDRO_CODES: Record<string, string> = {
    overall: 'HYD',
    precipitation: 'RAIN',
    cropland_extent: 'CROP',
    irrigated_area_extent: 'IRR'
};

function donutSeries(state: ScreenStoreState): DonutSeries[] {
    if (state.detailedAgriculture)
        return scoreModel.agriculture.cropOrder.map((crop) => ({
            id: `crop:${crop}`,
            crop,
            keys: [],
            selected: true,
            label: scoreModel.agriculture.crops[crop].name,
            code: CROP_CODES[crop] ?? crop.slice(0, 4).toUpperCase(),
            color: scoreModel.agriculture.crops[crop].color
        }));
    if (state.detailedHydro)
        return [
            {
                id: 'hydro:overall',
                hydro: 'overall',
                keys: [],
                selected: true,
                label: scoreModel.hydro.aggregate.name,
                code: HYDRO_CODES.overall,
                color: '#d6ac54'
            },
            ...scoreModel.hydro.variableOrder.map((variable, index) => ({
                id: `hydro:${variable}`,
                hydro: variable,
                keys: [],
                selected: true,
                label: scoreModel.hydro.variables[variable].name,
                code: HYDRO_CODES[variable] ?? variable.slice(0, 4).toUpperCase(),
                color: ['#4ca6d9', '#69b578', '#c99a43'][index % 3]
            }))
        ];
    const mapAggregateSelected =
        state.selectedDatasets.includes('agriculture_maps') ||
        state.selectedDatasets.includes('hydro_maps');
    return state.groupedByDomain && !mapAggregateSelected
        ? meta.categoryOrder
              .map((domain) => {
                  const keys = meta.datasetOrder.filter((id) => datasets[id].domain === domain);
                  return {
                      id: `domain:${domain}`,
                      keys,
                      label: domain,
                      code: DOMAIN_CODES[domain] ?? domain.slice(0, 4).toUpperCase(),
                      color: datasets[keys[0]]?.color ?? '#d6ac54',
                      selected: keys.some((id) => state.selectedDatasets.includes(id))
                  };
              })
              .filter((item) => item.keys.length)
        : meta.datasetOrder.map((id) => ({
              id,
              keys: [id],
              label: datasets[id].name,
              code: DATASET_CODES[id] ?? id.slice(0, 4).toUpperCase(),
              color: datasets[id].color,
              selected: state.selectedDatasets.includes(id)
          }));
}

function donutValue(
    item: DonutSeries,
    iso: string,
    state: ScreenStoreState,
    from: number,
    to: number
): MetricResult {
    const model = modelForEstimates(state.includeLsmsEstimates);
    return item.crop
        ? model.cropValue(iso, item.crop, state.agricultureMetric, from, to)
        : item.hydro
          ? model.hydroValue(iso, item.hydro, state.hydroMetric, from, to)
          : model.seriesValue(
                item.keys.filter((id) => state.selectedDatasets.includes(id)),
                iso,
                from,
                to,
                state.agricultureAggregation
            );
}

function MapDonuts({ state, zoom }: { state: ScreenStoreState; zoom: number }) {
    const model = useMemo(() => {
        const series = donutSeries(state);
        const features = world.features.filter((feature) => feature.id in datasets.dhs.records);
        return { series, features };
    }, [
        state.groupedByDomain,
        state.selectedDatasets,
        state.yearFrom,
        state.yearTo,
        state.yearlyHistograms,
        state.detailedAgriculture,
        state.detailedHydro,
        state.hydroMetric
    ]);
    const baseSize = Math.max(170, Math.min(340, 170 + (zoom - 4) * 45));
    return (
        <>
            {model.features.map((feature, index) => {
                const [longitude, latitude] =
                    MARKER_POSITIONS[feature.id] ?? featureCenter(feature.geometry.coordinates);
                const selected = state.countries.includes(feature.id);
                const size = selected ? Math.min(520, baseSize * 1.55) : baseSize;
                return (
                    <Marker
                        key={feature.id}
                        longitude={longitude}
                        latitude={latitude}
                        anchor="center"
                        style={{ zIndex: selected ? 10_000 + index : index }}
                    >
                        <CountryDonut
                            iso={feature.id}
                            name={feature.properties.name}
                            size={size}
                            selected={selected}
                            recessed={state.countries.length > 0 && !selected}
                            state={state}
                            series={model.series}
                        />
                    </Marker>
                );
            })}
        </>
    );
}

function CountryDonut({
    iso,
    name,
    size,
    selected,
    recessed,
    state,
    series
}: {
    iso: string;
    name: string;
    size: number;
    selected: boolean;
    recessed: boolean;
    state: ScreenStoreState;
    series: DonutSeries[];
}) {
    const paths: React.ReactNode[] = [];
    const labels: React.ReactNode[] = [];
    series.forEach((item, index) => {
        const sector = sectorAngles(series, index, datasets);
        labels.push(<SectorCode key={`label-${item.id}`} item={item} sector={sector} />);
        if (!item.selected) {
            paths.push(
                <path
                    key={item.id}
                    d={ringPath(sector.start, sector.end)}
                    fill="#4b5663"
                    opacity=".48"
                    stroke="#172230"
                    strokeWidth=".7"
                />
            );
            return;
        }
        if (!state.yearlyHistograms) {
            const value = donutValue(item, iso, state, state.yearFrom, state.yearTo);
            const metric = item.crop
                ? state.agricultureMetric
                : item.hydro
                  ? state.hydroMetric
                  : item.keys[0] === 'hydro_maps'
                    ? 'dispersion'
                    : item.keys[0] === 'agriculture_maps'
                      ? state.agricultureAggregation
                      : 'coverage';
            paths.push(
                <path
                    key={item.id}
                    d={ringPath(sector.start, sector.end)}
                    fill={scoreModel.color(value.value, metric)}
                    stroke="#172230"
                    strokeWidth=".7"
                >
                    <title>
                        {item.label}: {scoreModel.format(value, metric)}
                    </title>
                </path>
            );
            return;
        }
        const years = state.yearTo - state.yearFrom + 1;
        const bucket = (sector.end - sector.start) / years;
        for (let year = state.yearFrom; year <= state.yearTo; year++) {
            const value = donutValue(item, iso, state, year, year);
            const metric = item.crop
                ? state.agricultureMetric
                : item.hydro
                  ? state.hydroMetric
                  : item.keys[0] === 'hydro_maps'
                    ? 'dispersion'
                    : item.keys[0] === 'agriculture_maps'
                      ? state.agricultureAggregation
                      : 'coverage';
            const start = sector.start + (year - state.yearFrom) * bucket;
            paths.push(
                <path
                    key={`${item.id}-${year}`}
                    d={ringPath(start, Math.min(sector.end, start + Math.max(0.08, bucket - 0.08)))}
                    fill={scoreModel.color(value.value, metric)}
                    stroke="#172230"
                    strokeWidth=".14"
                >
                    <title>
                        {year} · {item.label}: {scoreModel.format(value, metric)}
                    </title>
                </path>
            );
        }
    });
    return (
        <div
            className={`pointer-events-none relative transition-opacity duration-300 ${selected ? 'drop-shadow-[0_0_18px_rgba(94,197,255,.95)]' : 'drop-shadow-[0_3px_5px_rgba(0,0,0,.85)]'} ${recessed ? 'opacity-35' : 'opacity-100'}`}
            style={{ width: size, height: size }}
        >
            <svg className="size-full" viewBox="0 0 60 60" aria-hidden="true">
                <circle cx="30" cy="30" r="28" fill="#172230" />
                {paths}
                {labels}
                <circle
                    cx="30"
                    cy="30"
                    r="13"
                    fill="#101923"
                    stroke={selected ? '#5ec5ff' : '#607287'}
                    strokeWidth={selected ? 2 : 1}
                />
            </svg>
            <span
                className="absolute top-[31%] left-1/4 flex h-[38%] w-1/2 items-center justify-center overflow-hidden text-center font-bold [overflow-wrap:anywhere] text-white [text-shadow:0_1px_2px_#000]"
                style={{ fontSize: Math.max(9, Math.min(15, size * 0.105)), lineHeight: 1.02 }}
            >
                {name}
            </span>
        </div>
    );
}

function SectorCode({
    item,
    sector
}: {
    item: DonutSeries;
    sector: { start: number; end: number };
}) {
    const [x, y] = polar(20.5, (sector.start + sector.end) / 2);
    return (
        <text
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            stroke="#101923"
            strokeWidth=".7"
            paintOrder="stroke"
            fontSize="3.2"
            fontWeight="700"
        >
            {item.code}
        </text>
    );
}

function MapLegend({ state }: { state: ScreenStoreState }) {
    const series = donutSeries(state);
    const metricLegends = (
        state.detailedAgriculture
            ? [
                  {
                      label: scoreModel.metrics[state.agricultureMetric].label,
                      metric: state.agricultureMetric
                  }
              ]
            : state.detailedHydro
              ? [{ label: scoreModel.metrics[state.hydroMetric].label, metric: state.hydroMetric }]
              : [
                    { label: 'Record-source coverage', metric: 'coverage' },
                    ...(state.selectedDatasets.includes('agriculture_maps')
                        ? [
                              {
                                  label: `Agricultural maps · ${scoreModel.metrics[state.agricultureAggregation].label}`,
                                  metric: state.agricultureAggregation
                              }
                          ]
                        : []),
                    ...(state.selectedDatasets.includes('hydro_maps')
                        ? [
                              {
                                  label: `Hydrology maps · ${scoreModel.metrics.dispersion.label}`,
                                  metric: 'dispersion'
                              }
                          ]
                        : [])
                ]
    ) as Array<{ label: string; metric: AgricultureMetric }>;
    const primaryMetric = metricLegends[0].metric;
    const metricInfo = scoreModel.metrics[primaryMetric];
    return (
        <aside className="pointer-events-none absolute top-8 left-8 z-30 w-[820px] rounded-[28px] border border-[#536577] bg-[#0f1620]/95 p-6 text-[#e7edf3] shadow-2xl">
            <span className="text-lg font-extrabold tracking-[.16em] text-[#5ec5ff] uppercase">
                Map legend
            </span>
            <h2 className="mt-1 text-3xl font-semibold">
                {state.detailedAgriculture || state.detailedHydro
                    ? metricInfo.label
                    : 'How to read each donut'}
            </h2>
            <div className="mt-4 grid grid-cols-[150px_1fr] items-center gap-5">
                <svg
                    className="size-[150px]"
                    viewBox="0 0 60 60"
                    role="img"
                    aria-label="Example radial dataset sectors"
                >
                    <circle cx="30" cy="30" r="28" fill="#172230" />
                    {series.map((item, index) => {
                        const angle = sectorAngles(series, index, datasets);
                        return (
                            <g key={item.label}>
                                <path
                                    d={ringPath(angle.start, angle.end)}
                                    fill={item.color}
                                    stroke="#172230"
                                    strokeWidth=".7"
                                />
                                <SectorCode item={item} sector={angle} />
                            </g>
                        );
                    })}
                    <circle cx="30" cy="30" r="13" fill="#101923" stroke="#607287" />
                </svg>
                <div>
                    <p className="text-xl leading-relaxed text-[#c3ced8]">
                        Each radial sector represents{' '}
                        {state.detailedAgriculture
                            ? 'one crop'
                            : state.detailedHydro
                              ? 'one hydrology comparison'
                              : state.groupedByDomain
                                ? 'one data category'
                                : 'one dataset'}
                        . The centre names the country.
                    </p>
                    <p className="mt-2 text-lg text-[#9fb0c0]">
                        {state.yearlyHistograms
                            ? 'Each sector is split into annual bins; grey bins are unavailable.'
                            : 'Each sector summarises the selected time window.'}
                    </p>
                </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2">
                {series.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-base">
                        <span className="flex gap-1">
                            {(item.crop || item.hydro) && (
                                <i
                                    className="size-3 rounded-sm"
                                    style={{ background: item.color }}
                                />
                            )}
                            {item.keys.map((id) => (
                                <i
                                    key={id}
                                    className="size-3 rounded-sm"
                                    style={{ background: datasets[id].color }}
                                />
                            ))}
                        </span>
                        <span>
                            <b className="mr-2 text-[#e7edf3]">{item.code}</b>
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
            <div
                className={`mt-5 grid gap-4 ${metricLegends.length > 1 ? 'grid-cols-3' : 'grid-cols-1'}`}
            >
                {metricLegends.map(({ label, metric }) => {
                    const info = scoreModel.metrics[metric];
                    const maximum = scoreModel.maxima[metric];
                    return (
                        <div key={`${label}-${metric}`}>
                            <p className="mb-1 min-h-10 text-sm leading-tight font-semibold text-[#c3ced8]">
                                {label}
                            </p>
                            <div
                                className="h-4 rounded-full"
                                style={{
                                    background: `linear-gradient(90deg,${scoreModel.color(0, metric)},${scoreModel.color((maximum || 1) / 2, metric)},${scoreModel.color(maximum || 1, metric)})`
                                }}
                            />
                            <div className="mt-1 flex justify-between gap-2 text-xs text-[#9fb0c0]">
                                <span>0 {info.unit}</span>
                                <span>
                                    {maximum
                                        ? `${maximum.toFixed(2)} ${info.unit}`
                                        : 'No available values'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="mt-4 flex items-center gap-2 text-base text-[#9fb0c0]">
                <i className="size-4 rounded bg-[#4b5663]" /> Grey sectors are unavailable or
                switched off.
            </p>
            {(state.detailedAgriculture || state.detailedHydro) && (
                <p className="mt-2 text-base text-[#9fb0c0]">{metricInfo.note}</p>
            )}
            {state.detailedAgriculture && (
                <p className="mt-2 text-base text-[#9fb0c0]">{scoreModel.agriculture.reason}</p>
            )}
            {state.detailedHydro && (
                <p className="mt-2 text-base text-[#9fb0c0]">{scoreModel.hydro.reason}</p>
            )}
        </aside>
    );
}

function MiniControllerQr() {
    const [invitation, setInvitation] = useState<{
        svg: string;
        expiresAt: number;
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
        <aside className="absolute top-10 right-10 isolate z-[1000000] w-[620px] rounded-[28px] border border-[#536577] bg-[#0f1620]/95 p-9 text-center text-[#e7edf3] shadow-2xl">
            <span className="text-xl font-extrabold tracking-[.16em] text-[#5ec5ff] uppercase">
                Join the wall
            </span>
            <h2 className="mt-2 text-4xl font-semibold">Choose a country</h2>
            <div
                className="mx-auto mt-7 flex size-[420px] items-center justify-center overflow-hidden rounded-2xl bg-white p-4"
                dangerouslySetInnerHTML={{ __html: invitation?.svg ?? '' }}
            />
            <p className="mt-6 text-2xl leading-relaxed text-[#c3ced8]">
                Scan with your phone to add a DHS country to the comparison.
            </p>
            <p className="mt-3 text-lg text-[#9fb0c0]">
                The code refreshes automatically for security.
            </p>
        </aside>
    );
}

function sectorAngles(series: DonutSeries[], index: number, source: Record<string, Dataset>) {
    const size = 360 / series.length;
    const category = (item: DonutSeries) =>
        item.crop ? 'Agriculture' : item.hydro ? 'Hydrology' : source[item.keys[0]].domain;
    const domain = category(series[index]);
    const previous = category(series[(index + series.length - 1) % series.length]);
    const next = category(series[(index + 1) % series.length]);
    const categoryGaps = series.length > meta.categoryOrder.length;
    return {
        start: index * size + (categoryGaps && domain !== previous ? 8 : 1),
        end: (index + 1) * size - (categoryGaps && domain !== next ? 8 : 1)
    };
}
function polar(radius: number, angle: number) {
    const radians = ((angle - 90) * Math.PI) / 180;
    return [30 + radius * Math.cos(radians), 30 + radius * Math.sin(radians)];
}
function ringPath(start: number, end: number) {
    const outerStart = polar(27, start),
        outerEnd = polar(27, end),
        innerEnd = polar(14, end),
        innerStart = polar(14, start),
        large = end - start > 180 ? 1 : 0;
    return `M${outerStart.join(' ')} A27 27 0 ${large} 1 ${outerEnd.join(' ')} L${innerEnd.join(' ')} A14 14 0 ${large} 0 ${innerStart.join(' ')} Z`;
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

function DetailsTile({ c, r, state }: { c: number; r: number; state: ScreenStoreState }) {
    const localColumn = c - DETAIL_START_COL;
    const selected = [...state.countries]
        .slice(0, MAX_COMPARE_COUNTRIES)
        .sort((a, b) => countryName(a).localeCompare(countryName(b)));
    return (
        <div
            className="overflow-hidden bg-[#172230] py-24 text-[#e7edf3]"
            style={{
                width: DETAIL_COLS * SCREEN_WIDTH,
                height: WALL_ROWS * SCREEN_HEIGHT,
                transform: `translate(${-localColumn * SCREEN_WIDTH}px,${-r * SCREEN_HEIGHT}px)`
            }}
        >
            <header className="mx-24 flex items-end justify-between border-b border-[#2c3e50] pb-10">
                <span className="text-3xl font-extrabold tracking-[.18em] text-[#5ec5ff] uppercase">
                    Country details
                </span>
                <p className="text-4xl text-[#9fb0c0]">
                    {selected.length
                        ? `${selected.length} selected ${selected.length === 1 ? 'country' : 'countries'} · ${state.yearFrom}–${state.yearTo}`
                        : 'Choose countries from the controller'}
                </p>
            </header>
            {selected.length ? (
                <div
                    className="mt-14 grid h-[3860px] items-start"
                    style={{ gridTemplateColumns: `repeat(${DETAIL_COLS}, ${SCREEN_WIDTH}px)` }}
                >
                    {selected.map((iso) => (
                        <CountryDetails key={iso} iso={iso} state={state} />
                    ))}
                </div>
            ) : (
                <div className="mx-24 mt-40 rounded-[40px] border border-dashed border-[#536577] p-24 text-left text-6xl text-[#9fb0c0]">
                    Choose countries from the controller to compare their records across datasets
                    and years.
                </div>
            )}
        </div>
    );
}

function CountryDetails({ iso, state }: { iso: string; state: ScreenStoreState }) {
    const datasets = datasetsForEstimates(state.includeLsmsEstimates) as Record<string, Dataset>;
    if (state.detailedAgriculture)
        return (
            <article className="relative mx-24 h-[3680px] min-w-0 overflow-hidden rounded-[32px] border border-[#2c3e50] bg-[#131d29] p-9">
                <h2 className="text-5xl font-semibold">{countryName(iso)}</h2>
                <div className="mt-10">
                    <CoverageFormula mapMetric />
                </div>
                <p className="mt-6 line-clamp-2 text-xl leading-relaxed text-[#9fb0c0]">
                    {scoreModel.metrics[state.agricultureMetric].note}
                </p>
                <div className="absolute inset-x-9 top-[880px] grid grid-cols-3 gap-4">
                    {scoreModel.agriculture.cropOrder.map((crop) => (
                        <CompactCropMetric key={crop} iso={iso} state={state} crop={crop} />
                    ))}
                </div>
            </article>
        );
    if (state.detailedHydro)
        return (
            <article className="relative mx-24 h-[3680px] min-w-0 overflow-hidden rounded-[32px] border border-[#2c3e50] bg-[#131d29] p-9">
                <h2 className="text-5xl font-semibold">{countryName(iso)}</h2>
                <div className="mt-10">
                    <CoverageFormula mapMetric />
                </div>
                <p className="mt-6 line-clamp-2 text-xl leading-relaxed text-[#9fb0c0]">
                    {scoreModel.metrics[state.hydroMetric].note}
                </p>
                <div className="absolute inset-x-9 top-[880px] grid grid-cols-2 gap-5">
                    {['overall', ...scoreModel.hydro.variableOrder].map((variable) => (
                        <CompactHydroMetric
                            key={variable}
                            iso={iso}
                            state={state}
                            variable={variable}
                        />
                    ))}
                </div>
            </article>
        );
    const rows = state.selectedDatasets.map((id) => ({
        id,
        dataset: datasets[id],
        count: countRecords(datasets[id]?.records[iso], state.yearFrom, state.yearTo),
        score: modelForEstimates(state.includeLsmsEstimates).datasetValue(
            id,
            iso,
            state.yearFrom,
            state.yearTo,
            state.agricultureAggregation
        )
    }));
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const assessed = rows.filter((row) => row.score.value !== null);
    const gaps = assessed.filter((row) => row.score.value! < 0.33);
    const domains = meta.categoryOrder
        .map((domain) => ({ domain, rows: rows.filter((row) => row.dataset.domain === domain) }))
        .filter((group) => group.rows.length);
    return (
        <article className="relative mx-24 h-[3680px] min-w-0 overflow-hidden rounded-[32px] border border-[#2c3e50] bg-[#131d29] p-9">
            <header>
                <h2 className="pr-8 text-5xl leading-tight font-semibold">{countryName(iso)}</h2>
                <p className="mt-3 text-xl text-[#9fb0c0]">
                    {total.toLocaleString()} selected{' '}
                    {rows.length === 1 ? (rows[0].dataset.unit ?? 'records') : 'records'}
                </p>
                <p className="mt-1 text-lg text-[#5ec5ff]">
                    Selected by {state.countryAttribution[iso] ?? 'Presenter'}
                </p>
            </header>
            <div className="mt-10">
                <CoverageFormula />
            </div>
            <section className="mt-10 rounded-2xl border-l-8 border-[#5ec5ff] bg-[#172230] px-5 py-4">
                <h3 className="text-xl font-semibold">
                    {gaps.length
                        ? 'Coverage gaps across selected sources'
                        : assessed.length
                          ? 'Broad coverage across selected sources'
                          : 'Coverage unavailable'}
                </h3>
                <p className="mt-2 text-lg leading-relaxed text-[#9fb0c0]">
                    {gaps.length
                        ? `Lower relative coverage: ${gaps.map((row) => row.dataset.name).join(', ')}.`
                        : assessed.length
                          ? 'No selected source falls in the lower third of the coverage scale.'
                          : 'No verified results for the selected sources and years.'}
                </p>
            </section>
            <div>
                {domains.map((group) => (
                    <div key={group.domain} className={countryDomainSlot(group.domain)}>
                        <DomainDetail
                            domain={group.domain}
                            rows={group.rows}
                            iso={iso}
                            state={state}
                        />
                    </div>
                ))}
            </div>
        </article>
    );
}

function CoverageFormula({ mapMetric = false }: { mapMetric?: boolean }) {
    return (
        <section className="rounded-2xl border border-[#2c3e50] bg-[#101923] px-5 py-4 text-[#9fb0c0]">
            <p className="text-xl leading-relaxed">
                Coverage compares each record dataset with the DHS-country pool: how many counted
                units it has per million km² and how consistently it appears across the selected
                years. α is fixed at 0.6 and β at 0.4.
            </p>
            <p className="mt-2 text-lg leading-relaxed text-[#c3d2df]">
                coverage score = α × log(1 + units per million km²) ÷ log(1 + highest pool density)
                + β × years with units ÷ selected years
            </p>
            {mapMetric && (
                <p className="mt-2 text-lg leading-relaxed text-[#73889b]">
                    The map values below use the selected comparison metric, not this coverage
                    score.
                </p>
            )}
        </section>
    );
}

function countryDomainSlot(domain: string) {
    switch (domain) {
        case 'Ecology':
            return 'absolute inset-x-9 top-[880px] h-[920px]';
        case 'Agriculture':
            return 'absolute top-[1960px] bottom-[980px] left-9 w-[calc(50%-28px)]';
        case 'Hydrology':
            return 'absolute top-[1960px] right-9 bottom-[980px] w-[calc(50%-28px)]';
        case 'Public Health':
            return 'absolute inset-x-9 top-[3040px] bottom-9';
        default:
            return 'absolute inset-x-9 top-[3040px] bottom-9';
    }
}

function CompactCropMetric({
    iso,
    state,
    crop
}: {
    iso: string;
    state: ScreenStoreState;
    crop: string;
}) {
    const source = scoreModel.agriculture.crops[crop];
    const value = scoreModel.cropValue(
        iso,
        crop,
        state.agricultureMetric,
        state.yearFrom,
        state.yearTo
    );
    return (
        <section className="min-w-0 rounded-2xl border border-[#2c3e50] bg-[#101923] px-5 py-4">
            <h3 className="truncate text-2xl font-semibold" title={source.name}>
                {source.name}
            </h3>
            <p className="mt-2 text-3xl font-semibold text-[#5ec5ff]">
                {scoreModel.format(value, state.agricultureMetric)}
            </p>
            <p className="mt-1 text-lg text-[#9fb0c0]">
                {value.available} of {value.expected} years with results
            </p>
        </section>
    );
}

function CompactHydroMetric({
    iso,
    state,
    variable
}: {
    iso: string;
    state: ScreenStoreState;
    variable: string;
}) {
    const source =
        variable === 'overall' ? scoreModel.hydro.aggregate : scoreModel.hydro.variables[variable];
    const value = scoreModel.hydroValue(
        iso,
        variable,
        state.hydroMetric,
        state.yearFrom,
        state.yearTo
    );
    return (
        <section className="min-w-0 rounded-2xl border border-[#2c3e50] bg-[#101923] px-5 py-4">
            <h3 className="truncate text-2xl font-semibold" title={source.name}>
                {source.name}
            </h3>
            <p className="mt-2 text-3xl font-semibold text-[#5ec5ff]">
                {scoreModel.format(value, state.hydroMetric)}
            </p>
            <p className="mt-1 text-lg text-[#9fb0c0]">
                {value.available} of {value.expected} years with results
            </p>
        </section>
    );
}

function DomainDetail({
    domain,
    rows,
    iso,
    state
}: {
    domain: string;
    rows: Array<{ id: string; dataset: Dataset; count: number; score: MetricResult }>;
    iso: string;
    state: ScreenStoreState;
}) {
    const years = Array.from(
        { length: state.yearTo - state.yearFrom + 1 },
        (_, index) => state.yearFrom + index
    );
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const model = modelForEstimates(state.includeLsmsEstimates);
    const score = model.seriesValue(
        rows.map((row) => row.id),
        iso,
        state.yearFrom,
        state.yearTo,
        state.agricultureAggregation
    );
    return (
        <section className="h-full overflow-hidden rounded-2xl border border-[#2c3e50] bg-[#101923] px-6 py-5">
            <h3 className="flex items-center gap-4 text-4xl font-semibold">
                <span className="flex gap-2">
                    {rows.map((row) => (
                        <i
                            key={row.id}
                            className="size-5 rounded"
                            style={{ background: row.dataset.color }}
                        />
                    ))}
                </span>
                {domain}
            </h3>
            <p className="mt-3 text-2xl text-[#9fb0c0]">
                {total.toLocaleString()}{' '}
                {rows.length === 1 ? (rows[0].dataset.unit ?? 'records') : 'records'} in this window
                → {model.formatCoverageScore(score)}
            </p>
            <div className="mt-5 flex h-9 gap-[2px] overflow-hidden rounded bg-[#101821]">
                {years.map((year) => {
                    const annual = model.seriesValue(
                        rows.map((row) => row.id),
                        iso,
                        year,
                        year,
                        state.agricultureAggregation
                    );
                    return (
                        <i
                            key={year}
                            className="min-w-0 flex-1"
                            style={{ background: model.color(annual.value, 'coverage') }}
                        />
                    );
                })}
            </div>
            <div className="mt-2 flex justify-between text-lg text-[#9fb0c0]">
                <span>{state.yearFrom}</span>
                <span>{state.yearTo}</span>
            </div>
            <div
                className={`mt-5 grid gap-4 ${domain === 'Ecology' ? 'grid-cols-2' : domain === 'Public Health' ? 'grid-cols-3' : 'grid-cols-1'}`}
            >
                {rows.map((row) => (
                    <DatasetDetail
                        key={row.id}
                        id={row.id}
                        dataset={row.dataset}
                        iso={iso}
                        count={row.count}
                        state={state}
                    />
                ))}
            </div>
        </section>
    );
}

function DatasetDetail({
    id,
    dataset,
    iso,
    count,
    state
}: {
    id: string;
    dataset: Dataset;
    iso: string;
    count: number;
    state: ScreenStoreState;
}) {
    if (id === 'dhs') return <DhsSurveyYears dataset={dataset} iso={iso} state={state} />;
    const years = Array.from(
        { length: state.yearTo - state.yearFrom + 1 },
        (_, i) => state.yearFrom + i
    );
    const model = modelForEstimates(state.includeLsmsEstimates);
    const score = model.datasetValue(
        id,
        iso,
        state.yearFrom,
        state.yearTo,
        state.agricultureAggregation
    );
    return (
        <section className="min-w-0 rounded-xl border border-[#2c3e50] bg-[#131d29] px-4 py-4">
            <h3 className="flex items-center gap-3 text-3xl font-semibold">
                <i className="size-5 rounded" style={{ background: dataset.color }} />
                {dataset.name}
            </h3>
            <p className="mt-2 text-xl text-[#9fb0c0]">
                {count.toLocaleString()} {dataset.unit ?? 'records'} in this window →{' '}
                {model.formatCoverageScore(score)}
            </p>
            <p className="mt-2 line-clamp-2 text-lg leading-relaxed text-[#73889b]">
                {dataset.description ?? DATASET_REFERENCE[id]?.description}
            </p>
            <div className="mt-4 flex h-7 gap-[2px] overflow-hidden rounded bg-[#101821]">
                {years.map((year) => {
                    const value = model.datasetValue(
                        id,
                        iso,
                        year,
                        year,
                        state.agricultureAggregation
                    );
                    return (
                        <i
                            key={year}
                            className="min-w-0 flex-1"
                            style={{ background: model.color(value.value, 'coverage') }}
                        />
                    );
                })}
            </div>
        </section>
    );
}

function DhsSurveyYears({
    dataset,
    iso,
    state
}: {
    dataset: Dataset;
    iso: string;
    state: ScreenStoreState;
}) {
    const years = (dataset.surveyYears?.[iso] ?? []).filter(
        (entry) => entry.year >= state.yearFrom && entry.year <= state.yearTo
    );
    const model = modelForEstimates(state.includeLsmsEstimates);
    const score = model.datasetValue(
        'dhs',
        iso,
        state.yearFrom,
        state.yearTo,
        state.agricultureAggregation
    );
    return (
        <section className="min-w-0 rounded-xl border border-[#2c3e50] bg-[#131d29] px-4 py-4">
            <h3 className="flex items-center gap-3 text-3xl font-semibold">
                <i className="size-5 rounded" style={{ background: dataset.color }} />
                DHS
            </h3>
            <p className="mt-2 text-xl text-[#9fb0c0]">
                {years.length} survey{years.length === 1 ? '' : 's'} in this window →{' '}
                {model.formatCoverageScore(score)}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
                {years.map((entry) => (
                    <span
                        key={entry.year}
                        className={`rounded-lg border px-4 py-2 text-xl ${entry.nutrition ? 'border-[#55c271] bg-[#183b2a] text-[#c8f5d5]' : 'border-[#2c3e50] text-[#9fb0c0]'}`}
                    >
                        {entry.label}
                        {entry.nutrition ? ' · nutrition' : ''}
                    </span>
                ))}
                {!years.length && (
                    <span className="text-xl text-[#9fb0c0]">No DHS surveys in this window.</span>
                )}
            </div>
        </section>
    );
}
function countryName(iso: string) {
    return world.features.find((feature) => feature.id === iso)?.properties.name ?? iso;
}
function buildCoverage(state: ScreenStoreState) {
    const datasets = datasetsForEstimates(state.includeLsmsEstimates) as Record<string, Dataset>;
    const totals = new globalThis.Map<string, number>();
    for (const feature of world.features)
        totals.set(
            feature.id,
            state.selectedDatasets.reduce(
                (sum, id) =>
                    sum +
                    countRecords(datasets[id]?.records[feature.id], state.yearFrom, state.yearTo),
                0
            )
        );
    return {
        ...world,
        features: world.features.map((feature) => ({
            ...feature,
            properties: {
                ...feature.properties,
                count: totals.get(feature.id) ?? 0,
                inScope: feature.id in datasets.dhs.records,
                selected: state.countries.includes(feature.id)
            }
        }))
    };
}
function countRecords(records: Record<string, number> | undefined, from: number, to: number) {
    return Object.entries(records ?? {}).reduce(
        (sum, [year, count]) =>
            Number(year) >= from && Number(year) <= to ? sum + Number(count) : sum,
        0
    );
}
function deriveScreenMapView(baseView: MapViewState, c: number, r: number): MapViewState {
    const viewport = new WebMercatorViewport({
        ...baseView,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT
    });
    const [centerX, centerY] = viewport.project([baseView.longitude, baseView.latitude]);
    const [longitude, latitude] = viewport.unproject([
        centerX + (c + 0.5 - MAP_COLS / 2) * SCREEN_WIDTH,
        centerY + (r + 0.5 - WALL_ROWS / 2) * SCREEN_HEIGHT
    ]);
    return { ...baseView, longitude, latitude };
}
