import { createFileRoute } from '@tanstack/react-router';

import {
    developmentControlToken,
    isControlTokenRequired,
    validateControlToken
} from '../lib/server/control-auth';

export const Route = createFileRoute('/api/control/auth')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const supplied = new URL(request.url).searchParams.get('token') ?? '';
                const devToken = developmentControlToken();
                const effective = supplied || devToken;
                const authorized = validateControlToken(effective);
                return Response.json(
                    {
                        authorized,
                        required: isControlTokenRequired(),
                        warning: !isControlTokenRequired(),
                        controlToken: authorized && devToken ? devToken : undefined
                    },
                    {
                        status: authorized ? 200 : 401,
                        headers: { 'cache-control': 'no-store' }
                    }
                );
            }
        }
    }
});
