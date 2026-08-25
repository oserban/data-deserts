import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { withBasePath } from '../lib/base-path';

const DevPlayground = lazy(() => import('../components/dev-playground'));

type IndexSearch = { screens?: string };

export const Route = createFileRoute('/')({
    validateSearch: (search: Record<string, unknown>): IndexSearch =>
        typeof search.screens === 'string' ? { screens: search.screens } : {},
    component: IndexPage
});

function IndexPage() {
    const { screens } = Route.useSearch();
    if (import.meta.env.DEV) {
        return (
            <Suspense fallback={null}>
                <DevPlayground screens={screens} />
            </Suspense>
        );
    }
    return (
        <main className="flex min-h-screen items-center justify-center bg-[#0f1620] text-[#e7edf3]">
            <section className="max-w-xl px-8 text-center">
                <h1 className="text-5xl font-bold">Data Deserts wall</h1>
                <p className="mt-5 text-lg text-[#9fb0c0]">
                    Open a coordinate-addressed screen on each display or use the controller.
                </p>
                <a
                    className="mt-8 inline-block rounded-lg bg-[#5ec5ff] px-5 py-3 font-semibold text-[#07111b]"
                    href={withBasePath('/control?operator=A')}
                >
                    Open controller
                </a>
            </section>
        </main>
    );
}
