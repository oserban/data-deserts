import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/time')({
    server: {
        handlers: {
            GET: async () =>
                Response.json({ now: Date.now() }, { headers: { 'cache-control': 'no-store' } })
        }
    }
});
