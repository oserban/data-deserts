import { createFileRoute } from '@tanstack/react-router';

import { findDataset } from '../lib/server/data-service';

export const Route = createFileRoute('/api/datasets/$id')({
    server: {
        handlers: {
            GET: async ({ params }) => {
                const dataset = findDataset(params.id);
                return dataset
                    ? Response.json(dataset)
                    : Response.json({ error: 'Dataset not found' }, { status: 404 });
            }
        }
    }
});
