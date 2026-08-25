import { createFileRoute } from '@tanstack/react-router';

import type { DataDesertsState } from '../lib/realtime';
import { validateControlToken } from '../lib/server/control-auth';
import { getWallState, updateWallState } from '../lib/server/wall-state';

export const Route = createFileRoute('/api/state')({
    server: {
        handlers: {
            GET: async () =>
                Response.json(getWallState(), { headers: { 'cache-control': 'no-store' } }),
            POST: async ({ request }) => {
                if (!validateControlToken(request.headers.get('x-control-token'))) {
                    return Response.json({ error: 'Invalid controller token.' }, { status: 401 });
                }
                const payload = (await request.json()) as { state?: Partial<DataDesertsState> };
                const state = payload.state ? updateWallState(payload.state) : getWallState();
                return Response.json(state, { headers: { 'cache-control': 'no-store' } });
            }
        }
    }
});
