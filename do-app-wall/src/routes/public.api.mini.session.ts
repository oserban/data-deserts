import { createFileRoute } from '@tanstack/react-router';

import { exchangeInvitation } from '../lib/server/mini-controller-auth';

export const Route = createFileRoute('/public/api/mini/session')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
                const session =
                    typeof body?.token === 'string' ? exchangeInvitation(body.token) : null;
                return session
                    ? Response.json(session, { headers: { 'cache-control': 'no-store' } })
                    : Response.json(
                          { error: 'This controller link has expired or has already been opened. Rescan the QR code.' },
                          { status: 410, headers: { 'cache-control': 'no-store' } }
                      );
            }
        }
    }
});
