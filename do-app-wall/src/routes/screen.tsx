import { createFileRoute } from '@tanstack/react-router';

import { WallScreen } from '../components/wall/wall-screen';
import { WALL_COLS, WALL_ROWS } from '../lib/wall-config';

export const Route = createFileRoute('/screen')({
    validateSearch: (search: Record<string, unknown>) => ({
        c: coordinate(search.c, WALL_COLS),
        r: coordinate(search.r, WALL_ROWS)
    }),
    component: ScreenPage
});

function ScreenPage() {
    return <WallScreen {...Route.useSearch()} />;
}

function coordinate(value: unknown, size: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.min(size - 1, Math.max(0, parsed)) : 0;
}
