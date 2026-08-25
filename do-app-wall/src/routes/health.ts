import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/health')({
    server: {
        handlers: {
            GET: async () =>
                Response.json({ status: 'ok', wall: { columns: 16, rows: 4 }, rendering: 'ssr' })
        }
    }
});
