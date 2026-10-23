import { createFileRoute } from '@tanstack/react-router';

import { hooks } from './bus';

export const Route = createFileRoute('/public/bus')({
    server: {
        handlers: {
            GET: async () =>
                Object.assign(new Response('WebSocket upgrade is required.', { status: 426 }), {
                    crossws: hooks
                })
        }
    }
});
