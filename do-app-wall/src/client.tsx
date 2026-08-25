import { RouterProvider } from '@tanstack/react-router';
import { hydrate } from '@tanstack/react-router/ssr/client';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { getRouter } from './router';

// TanStack Start's default client bootstrap replaces the router base path with its build-time
// value. This deployment uses an SSR-provided runtime value instead, so hydrate explicitly while
// preserving the base path configured by getRouter().
const router = getRouter();
await hydrate(router);

startTransition(() => {
    hydrateRoot(
        document,
        <StrictMode>
            <RouterProvider router={router} />
        </StrictMode>
    );
});
