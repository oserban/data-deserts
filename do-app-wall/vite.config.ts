import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite-plus';

const basePath = process.env.BASE_PATH ?? './';

function vizzyPublicAssets(): Plugin {
    return {
        name: 'vizzy-public-assets',
        apply: 'build',
        generateBundle(_options, bundle) {
            if (!basePath.startsWith('/serve/')) return;
            const assetBase = `${basePath.replace(/\/$/, '')}/assets/`;
            const publicAssetBase = `${basePath.replace(/\/$/, '')}/public/assets/`;
            for (const output of Object.values(bundle)) {
                if (output.type === 'chunk') {
                    output.code = output.code.replaceAll(assetBase, publicAssetBase);
                    // Vite's lazy CSS loader joins its base and "assets/file.css" at runtime.
                    if (output.fileName.includes('preload-helper-')) {
                        output.code = output.code.replaceAll(
                            `return\`${basePath}\`+`,
                            `return\`${basePath}public/\`+`
                        );
                    }
                } else if (output.fileName.endsWith('.css') && typeof output.source === 'string') {
                    output.source = output.source.replaceAll(assetBase, publicAssetBase);
                }
            }
        }
    };
}

export default defineConfig({
    // Router and Nitro keep the private demo base; the client chunks use public asset URLs.
    base: basePath,
    build: {
        modulePreload: basePath.startsWith('/serve/') ? false : undefined,
        assetsInlineLimit: basePath.startsWith('/serve/') ? 160 * 1024 : undefined
    },
    staged: { '*': 'vp check --fix' },
    lint: { options: { typeAware: true, typeCheck: true } },
    fmt: {
        tabWidth: 4,
        semi: true,
        printWidth: 100,
        singleQuote: true,
        trailingComma: 'none',
        sortImports: {},
        sortTailwindcss: {
            attributes: ['class', 'className'],
            functions: ['clsx', 'cn', 'cva', 'tw']
        },
        sortPackageJson: true,
        ignorePatterns: ['pnpm-lock.yaml', 'routeTree.gen.ts', '.tanstack/', '.output/', 'dist']
    },
    resolve: {
        tsconfigPaths: true
    },
    server: {
        allowedHosts: ['sporty-slogan-moonwalk.ngrok-free.dev'],
        hmr: false,
        host: true,
        port: 5780,
        watch: {
            usePolling: true,
            interval: 100
        }
    },
    css: {
        transformer: 'lightningcss',
        lightningcss: {
            cssModules: true
        }
    },
    plugins: [
        vizzyPublicAssets(),
        devtools({
            consolePiping: { enabled: false }
        }),
        tanstackStart(),
        // https://tanstack.com/start/latest/docs/framework/react/guide/hosting
        nitro({
            baseURL: basePath.startsWith('/serve/') ? basePath : undefined,
            features: { websocket: true }
        }),
        viteReact(),
        // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#react-compiler
        babel({
            presets: [
                reactCompilerPreset({
                    target: '19'
                })
            ]
        }),
        tailwindcss()
    ]
});
