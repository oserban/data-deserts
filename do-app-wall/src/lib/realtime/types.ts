import data from '../../data/datasets.json';

export type BusMessage = {
    type: string;
    peerId?: string;
    peerCount?: number;
    [key: string]: unknown;
};
export type EngineRole = 'screen' | 'control';
export type EngineConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
export type MapViewState = {
    longitude: number;
    latitude: number;
    zoom: number;
    bearing: number;
    pitch: number;
};
export type MiniControllerParticipant = {
    id: string;
    name: string;
    connectedAt: number;
    lastSeenAt: number;
};
export type DataDesertsState = {
    yearFrom: number;
    yearTo: number;
    selectedDatasets: string[];
    groupedByDomain: boolean;
    yearlyHistograms: boolean;
    countries: string[];
    mapView: MapViewState;
    countryAttribution: Record<string, string>;
    participants: MiniControllerParticipant[];
};
export type BusSharedState = DataDesertsState;
export type HelloBusMessage = BusMessage & {
    type: 'hello';
    peerId: string;
    state?: BusSharedState;
};
export type StateBusMessage = BusMessage & { type: 'state/update'; state: DataDesertsState };
export type EngineStoreState = {
    role: EngineRole;
    peerId: string | null;
    connection: EngineConnectionState;
    messageCount: number;
    lastMessageType: string | null;
    lastMessageAt: number | null;
    lastError: string | null;
};
export type WallStoreState = EngineStoreState & DataDesertsState & { isInteracting: boolean };
export type ControlStoreState = WallStoreState;
export type ScreenStoreState = WallStoreState;
export const MAX_COMPARE_COUNTRIES = 8;
export const DEFAULT_STATE: DataDesertsState = {
    yearFrom: data.meta.yearMin,
    yearTo: data.meta.yearMax,
    selectedDatasets: [
        'biotime',
        'living_planet',
        'predicts',
        'gbif',
        'lsms_isa',
        'dhs',
        'mics',
        'lsms'
    ],
    groupedByDomain: true,
    yearlyHistograms: false,
    countries: [],
    countryAttribution: {},
    participants: [],
    mapView: { longitude: 15, latitude: 18, zoom: 5.2, bearing: 0, pitch: 0 }
};
const engineState = (role: EngineRole): EngineStoreState => ({
    role,
    peerId: null,
    connection: 'idle',
    messageCount: 0,
    lastMessageType: null,
    lastMessageAt: null,
    lastError: null
});
export const createInitialWallStoreState = (): WallStoreState => ({
    ...engineState('screen'),
    ...DEFAULT_STATE,
    isInteracting: false
});
