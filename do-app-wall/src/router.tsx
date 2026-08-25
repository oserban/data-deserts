import { createRouter } from '@tanstack/react-router';

import { DefaultCatchBoundary } from './components/default-catch-boundary';
import { DefaultNotFound } from './components/default-not-found';
import { getBasePath } from './lib/base-path';
import { routeTree } from './routeTree.gen';

export function getRouter() {
    return createRouter({
        routeTree,
        // Nginx strips the external prefix before forwarding SSR requests. The browser retains it.
        basepath: typeof document === 'undefined' ? '/' : getBasePath() || '/',
        defaultPreload: 'intent',
        defaultErrorComponent: DefaultCatchBoundary,
        defaultNotFoundComponent: DefaultNotFound,
        scrollRestoration: true,
        defaultStructuralSharing: true
    });
}
