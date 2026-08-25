import { createFileRoute } from '@tanstack/react-router';

import { validateControlToken } from '../lib/server/control-auth';
import { exchangeInvitation, revokeAllSessions } from '../lib/server/mini-controller-auth';
import { setParticipants } from '../lib/server/wall-state';

export const Route = createFileRoute('/api/mini/session')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
                const session =
                    typeof body?.token === 'string' ? exchangeInvitation(body.token) : null;
                return session
                    ? Response.json(session, { headers: { 'cache-control': 'no-store' } })
                    : Response.json(
                          {
                              error: 'This controller link has expired or has already been opened. Rescan the QR code.'
                          },
                          { status: 410, headers: { 'cache-control': 'no-store' } }
                      );
            },
            DELETE: async ({ request }) => {
                if (!validateControlToken(request.headers.get('x-control-token'))) {
                    return Response.json({ error: 'Invalid controller token.' }, { status: 401 });
                }
                const revoked = revokeAllSessions();
                setParticipants([]);
                return Response.json({ revoked }, { headers: { 'cache-control': 'no-store' } });
            }
        }
    }
});
