import { createFileRoute } from '@tanstack/react-router';

import { listDatasets } from '../lib/server/data-service';

export const Route = createFileRoute('/api/datasets')({
    server: { handlers: { GET: async () => Response.json(listDatasets()) } }
});
