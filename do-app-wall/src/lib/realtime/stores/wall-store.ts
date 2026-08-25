import { Store, useStore } from '@tanstack/react-store';

import { createInitialWallStoreState, type WallStoreState } from '../types';

export const wallStore = new Store(createInitialWallStoreState());

export function useWallStore(): WallStoreState;
export function useWallStore<T>(
    selector: (state: WallStoreState) => T,
    compare?: (a: T, b: T) => boolean
): T;
export function useWallStore<T>(
    selector?: (state: WallStoreState) => T,
    compare?: (a: T, b: T) => boolean
) {
    const safeSelector = (selector ?? ((state: WallStoreState) => state as unknown as T)) as (
        state: WallStoreState
    ) => T;
    return useStore(wallStore, safeSelector, compare);
}
