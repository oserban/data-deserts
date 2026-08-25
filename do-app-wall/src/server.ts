import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';

import { withBasePath } from './lib/base-path';
// Load runtime security configuration during process startup so an unsecured controller emits its
// warning immediately, before the first HTTP or WebSocket request arrives.
import './lib/server/control-auth';

const fetch = createStartHandler({
    handler: defaultStreamHandler,
    // TanStack's build manifest contains root-absolute asset URLs. Prefix them while resolving the
    // SSR manifest so the same build can be mounted at APP_BASE_PATH without buffering HTML.
    transformAssets: {
        cache: true,
        transform: ({ url }) => ({
            href: withBasePath(url.replace(/^\/\.\//, '/'))
        })
    }
});

export default { fetch };
