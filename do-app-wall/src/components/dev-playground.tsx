import {
    ArrowsClockwiseIcon,
    ArrowSquareOutIcon,
    MoonIcon,
    PlugsConnectedIcon,
    PlugsIcon,
    SunIcon
} from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { withBasePath } from '../lib/base-path';
import { useTheme } from '../lib/theme-provider';
import { SCREEN_HEIGHT, SCREEN_WIDTH, WALL_COLS, WALL_ROWS } from '../lib/wall-config';

type WallScreen = {
    // Logical wall coordinates.
    c: number;
    r: number;
    id: string;
};

export default function DevPlayground({ screens }: { screens?: string }) {
    return screens ? <SelectedScreensPage screenIds={screens.split(',')} /> : <HomePage />;
}

function HomePage() {
    const { theme, setTheme } = useTheme();
    const isDark = theme === 'dark';
    const [devControlToken, setDevControlToken] = useState('');
    useEffect(() => {
        let active = true;
        void fetch(withBasePath('/api/control/auth'), { cache: 'no-store' })
            .then((response) => response.json())
            .then((result: { controlToken?: string }) => {
                if (active) setDevControlToken(result.controlToken ?? '');
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    const wallScreens = useMemo<WallScreen[]>(() => {
        // Build the wall coordinate system.
        // These coordinates map directly to `/screen?c=<col>&r=<row>`.
        return Array.from({ length: WALL_COLS * WALL_ROWS }, (_, index) => {
            const c = index % WALL_COLS;
            const r = Math.floor(index / WALL_COLS);
            return { c, r, id: `${r}-${c}` };
        });
    }, []);

    const [selectedScreenIds, setSelectedScreenIds] = useState<Set<string>>(() => new Set());
    const [disconnectedControlById, setDisconnectedControlById] = useState<Record<string, boolean>>(
        {}
    );
    const [refreshControlNonceById, setRefreshControlNonceById] = useState<Record<string, number>>(
        {}
    );

    const controlPanels = [
        // Distinct operator identities simulate simultaneous collaboration.
        {
            id: 'a',
            label: 'Tablet #1',
            src: withBasePath(
                `/control?operator=A${devControlToken ? `&token=${encodeURIComponent(devControlToken)}` : ''}`
            )
        },
        {
            id: 'b',
            label: 'Tablet #2',
            src: withBasePath(
                `/control?operator=B${devControlToken ? `&token=${encodeURIComponent(devControlToken)}` : ''}`
            )
        }
    ];

    const buildScreenSrc = (screen: WallScreen) => {
        return withBasePath(`/screen?c=${screen.c}&r=${screen.r}`);
    };

    const toggleScreenSelection = (id: string) => {
        setSelectedScreenIds((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleControlDisconnect = (id: string) => {
        setDisconnectedControlById((prev) => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const refreshControlFrame = (id: string) => {
        setRefreshControlNonceById((prev) => ({
            ...prev,
            [id]: (prev[id] ?? 0) + 1
        }));
    };

    const buildControlSrc = (panel: (typeof controlPanels)[number]) => {
        const nonce = refreshControlNonceById[panel.id] ?? 0;
        const disconnected = disconnectedControlById[panel.id] ?? false;
        // Nonce query param forces iframe reload when "refresh" is pressed.
        return disconnected ? `/noop?v=${nonce}` : `${panel.src}&v=${nonce}`;
    };

    return (
        <main className="mx-auto flex h-screen w-full max-w-7xl flex-col gap-4 overflow-hidden px-4 py-4 text-[var(--foreground)] md:px-6">
            <section className="flex items-center justify-between">
                <h1 className="text-lg font-semibold tracking-tight md:text-xl">
                    DO Dev Playground
                </h1>
                <button
                    type="button"
                    onClick={() => setTheme(isDark ? 'light' : 'dark')}
                    aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                    title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                    className="rounded-md border border-[var(--border)] bg-[var(--card)] p-1.5 text-[var(--card-foreground)]"
                >
                    {isDark ? (
                        <SunIcon size={16} weight="duotone" />
                    ) : (
                        <MoonIcon size={16} weight="duotone" />
                    )}
                </button>
            </section>

            <section className="flex min-h-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-medium text-[var(--foreground)]">
                        Mini-DO ({WALL_ROWS} x {WALL_COLS}) · {SCREEN_WIDTH}x{SCREEN_HEIGHT} per
                        unit
                    </h2>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--muted-foreground)]">
                            {selectedScreenIds.size} selected
                        </span>
                        <button
                            type="button"
                            disabled={selectedScreenIds.size === 0}
                            onClick={() => {
                                const orderedIds = wallScreens
                                    .filter((screen) => selectedScreenIds.has(screen.id))
                                    .map((screen) => screen.id)
                                    .join(',');
                                window.open(
                                    `/?screens=${encodeURIComponent(orderedIds)}`,
                                    '_blank',
                                    'noopener,noreferrer'
                                );
                            }}
                            className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--card-foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Show selected
                        </button>
                        <button
                            type="button"
                            disabled={selectedScreenIds.size === 0}
                            onClick={() => {
                                setSelectedScreenIds(new Set());
                            }}
                            className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--card-foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Clear
                        </button>
                        <span className="rounded-full bg-[var(--primary)] px-2 py-1 text-[10px] font-medium text-[var(--primary-foreground)]">
                            /screen
                        </span>
                    </div>
                </div>

                <div className="bg-back m-auto flex h-fit items-start justify-center overflow-hidden">
                    <div
                        className="bg-back h-full max-h-full w-full shadow-lg"
                        style={{
                            aspectRatio: `${WALL_COLS * SCREEN_WIDTH} / ${WALL_ROWS * SCREEN_HEIGHT}`
                        }}
                    >
                        {/*
                          Simulator wall:
                          - each iframe acts as one physical display node
                          - controls let developers test reconnect/refresh behavior quickly
                          - opening any screen in a new tab simulates standalone deployment
                        */}
                        <div
                            className="grid h-full w-full gap-0"
                            style={{
                                gridTemplateColumns: `repeat(${WALL_COLS}, minmax(0, 1fr))`,
                                gridTemplateRows: `repeat(${WALL_ROWS}, minmax(0, 1fr))`
                            }}
                        >
                            {wallScreens.map((screen) => (
                                <MiniWallScreen
                                    key={screen.id}
                                    c={screen.c}
                                    r={screen.r}
                                    src={buildScreenSrc(screen)}
                                    selected={selectedScreenIds.has(screen.id)}
                                    onSelectionChange={() => toggleScreenSelection(screen.id)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="mb-2">
                    <h2 className="text-sm font-medium text-[var(--card-foreground)]">
                        Operator Panels
                    </h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                        Separate clients for multi-party control flow.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {controlPanels.map((panel) => (
                        <article
                            key={panel.id}
                            className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
                        >
                            <div className="flex items-center justify-between border-b border-[var(--border)] px-2 py-2 text-[11px] font-medium text-[var(--muted-foreground)]">
                                <span>{panel.label}</span>
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            window.open(
                                                buildControlSrc(panel),
                                                '_blank',
                                                'noopener,noreferrer'
                                            )
                                        }
                                        className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--card-foreground)]"
                                        aria-label="Open control in new tab"
                                        title="Open control in new tab"
                                    >
                                        <ArrowSquareOutIcon size={12} weight="duotone" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleControlDisconnect(panel.id)}
                                        className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--card-foreground)]"
                                        aria-label={
                                            disconnectedControlById[panel.id]
                                                ? 'Reconnect control'
                                                : 'Disconnect control'
                                        }
                                        title={
                                            disconnectedControlById[panel.id]
                                                ? 'Reconnect control'
                                                : 'Disconnect control'
                                        }
                                    >
                                        {disconnectedControlById[panel.id] ? (
                                            <PlugsConnectedIcon size={12} weight="duotone" />
                                        ) : (
                                            <PlugsIcon size={12} weight="duotone" />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => refreshControlFrame(panel.id)}
                                        className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--card-foreground)]"
                                        aria-label="Refresh control iframe"
                                        title="Refresh control iframe"
                                    >
                                        <ArrowsClockwiseIcon size={12} weight="duotone" />
                                    </button>
                                </div>
                            </div>
                            <div className="h-[25vh] min-h-[110px] bg-[var(--card)]">
                                <iframe
                                    src={buildControlSrc(panel)}
                                    title={panel.label}
                                    className="h-full w-full border-0"
                                />
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}

function SelectedScreensPage({ screenIds }: { screenIds: string[] }) {
    const selectedIds = new Set(screenIds);
    const screens = Array.from({ length: WALL_COLS * WALL_ROWS }, (_, index) => {
        const c = index % WALL_COLS;
        const r = Math.floor(index / WALL_COLS);
        return { c, r, id: `${r}-${c}` };
    }).filter((screen) => selectedIds.has(screen.id));
    const usedColumns = [...new Set(screens.map((screen) => screen.c))].sort((a, b) => a - b);
    const usedRows = [...new Set(screens.map((screen) => screen.r))].sort((a, b) => a - b);
    const columnPosition = new Map(usedColumns.map((column, index) => [column, index + 1]));
    const rowPosition = new Map(usedRows.map((row, index) => [row, index + 1]));
    const gridAspectRatio =
        (Math.max(1, usedColumns.length) * SCREEN_WIDTH) /
        (Math.max(1, usedRows.length) * SCREEN_HEIGHT);

    return (
        <main className="flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
            <div
                className="grid bg-black"
                style={{
                    width: `min(100vw, ${gridAspectRatio * 100}vh)`,
                    height: `min(100vh, ${100 / gridAspectRatio}vw)`,
                    aspectRatio: `${gridAspectRatio}`,
                    gridTemplateColumns: `repeat(${usedColumns.length}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${usedRows.length}, minmax(0, 1fr))`
                }}
            >
                {screens.map((screen) => (
                    <div
                        key={screen.id}
                        className="h-full w-full"
                        style={{
                            gridColumn: columnPosition.get(screen.c),
                            gridRow: rowPosition.get(screen.r)
                        }}
                    >
                        <MiniWallScreen
                            c={screen.c}
                            r={screen.r}
                            src={withBasePath(`/screen?c=${screen.c}&r=${screen.r}`)}
                            selected={false}
                            selectable={false}
                            onSelectionChange={() => undefined}
                        />
                    </div>
                ))}
            </div>
        </main>
    );
}

type MiniWallScreenProps = {
    c: number;
    r: number;
    src: string;
    selected: boolean;
    selectable?: boolean;
    onSelectionChange: () => void;
};

function MiniWallScreen({
    c,
    r,
    src,
    selected,
    selectable = true,
    onSelectionChange
}: MiniWallScreenProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;

        const updateScale = () => {
            // Render the screen at native 1920x1080 and scale via CSS transform.
            // This preserves the same viewport math as production displays while still fitting
            // in the simulator grid.
            setScale(node.clientWidth / SCREEN_WIDTH);
        };

        updateScale();

        const observer = new ResizeObserver(updateScale);
        observer.observe(node);

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className={`group relative h-full w-full overflow-hidden border ${selected ? 'border-2 border-[var(--primary)]' : 'border-black'}`}
        >
            <iframe
                src={src}
                title={`Wall screen c${c} r${r}`}
                className="pointer-events-none origin-top-left"
                style={{
                    width: SCREEN_WIDTH,
                    height: SCREEN_HEIGHT,
                    transform: `scale(${scale})`
                }}
            />

            {selectable ? (
                <label className="absolute top-1.5 left-1.5 flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 text-[10px] font-medium text-[var(--card-foreground)] shadow-sm">
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={onSelectionChange}
                        className="size-3 accent-[var(--primary)]"
                    />
                    c{c} r{r}
                </label>
            ) : null}
        </div>
    );
}
