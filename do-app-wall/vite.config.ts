import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
    // Relative client assets allow one build to run at any APP_BASE_PATH at server startup.
    base: './',
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
        devtools({
            consolePiping: { enabled: false }
        }),
        tanstackStart(),
        // https://tanstack.com/start/latest/docs/framework/react/guide/hosting
        nitro({
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
