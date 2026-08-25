import { createFileRoute } from '@tanstack/react-router';

import { getWorld } from '../lib/server/data-service';

export const Route = createFileRoute('/api/world')({
    server: { handlers: { GET: async () => Response.json(getWorld()) } }
});
