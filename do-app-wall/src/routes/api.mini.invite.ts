import { createFileRoute } from '@tanstack/react-router';
import QRCode from 'qrcode';

import { getBasePath } from '../lib/base-path';
import { createInvitation, invitationTtlSeconds } from '../lib/server/mini-controller-auth';

export const Route = createFileRoute('/api/mini/invite')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const invitation = createInvitation();
                const source = new URL(request.url);
                const protocol =
                    request.headers.get('x-forwarded-proto') ?? source.protocol.replace(':', '');
                const host =
                    request.headers.get('x-forwarded-host') ??
                    request.headers.get('host') ??
                    source.host;
                const url = `${protocol}://${host}${getBasePath()}/mini?token=${encodeURIComponent(invitation.token)}`;
                const svg = await QRCode.toString(url, {
                    type: 'svg',
                    errorCorrectionLevel: 'M',
                    margin: 1,
                    color: { dark: '#07111b', light: '#ffffff' }
                });
                return Response.json(
                    {
                        url,
                        svg,
                        expiresAt: invitation.expiresAt,
                        ttlSeconds: invitationTtlSeconds()
                    },
                    { headers: { 'cache-control': 'no-store' } }
                );
            }
        }
    }
});
