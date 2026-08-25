import { createFileRoute } from '@tanstack/react-router';

import { listCountries } from '../lib/server/data-service';

export const Route = createFileRoute('/api/countries')({
    server: { handlers: { GET: async () => Response.json(listCountries()) } }
});
