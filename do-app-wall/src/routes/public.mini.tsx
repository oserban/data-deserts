import { createFileRoute } from '@tanstack/react-router';

import { MiniControllerPage } from './mini';

export const Route = createFileRoute('/public/mini')({
    validateSearch: (search: Record<string, unknown>) => ({
        token: typeof search.token === 'string' ? search.token : ''
    }),
    component: PublicMiniControllerPage
});

function PublicMiniControllerPage() {
    return <MiniControllerPage invitationToken={Route.useSearch().token} />;
}
