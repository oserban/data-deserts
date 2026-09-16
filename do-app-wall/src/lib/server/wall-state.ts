import data from '../../data/datasets.json';
// Keep server imports out of the realtime barrel, which initializes client engines and stores.
// noinspection ES6PreferShortImport
import { DEFAULT_STATE, MAX_COMPARE_COUNTRIES, type DataDesertsState } from '../realtime/types';

const dhsRecords = (data.datasets as Record<string, { records: Record<string, unknown> }>).dhs
    .records;

let currentState: DataDesertsState = structuredClone(DEFAULT_STATE);

const finite = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function getWallState() {
    return currentState;
}

export function updateWallState(input: Partial<DataDesertsState>) {
    const previous = currentState;
    const clampYear = (value: unknown, fallback: number) =>
        Math.max(
            data.meta.yearMin,
            Math.min(data.meta.yearMax, Math.round(finite(value, fallback)))
        );
    const yearFrom = clampYear(input.yearFrom, previous.yearFrom);
    const yearTo = Math.max(yearFrom, clampYear(input.yearTo, previous.yearTo));
    const countries = Array.isArray(input.countries)
        ? [
              ...new Set(
                  input.countries.filter(
                      (iso): iso is string => typeof iso === 'string' && iso in dhsRecords
                  )
              )
          ].slice(0, MAX_COMPARE_COUNTRIES)
        : previous.countries;
    const countryAttribution = Object.fromEntries(
        countries.map((iso) => [
            iso,
            previous.countries.includes(iso)
                ? (previous.countryAttribution[iso] ?? 'Presenter')
                : 'Presenter'
        ])
    );
    currentState = {
        yearFrom,
        yearTo,
        selectedDatasets: Array.isArray(input.selectedDatasets)
            ? [
                  ...new Set(
                      input.selectedDatasets.filter((id): id is string => typeof id === 'string')
                  )
              ]
            : previous.selectedDatasets,
        groupedByDomain:
            typeof input.groupedByDomain === 'boolean'
                ? input.groupedByDomain
                : previous.groupedByDomain,
        yearlyHistograms:
            typeof input.yearlyHistograms === 'boolean'
                ? input.yearlyHistograms
                : previous.yearlyHistograms,
        countries,
        countryAttribution,
        participants: previous.participants,
        mapView: {
            longitude: finite(input.mapView?.longitude, previous.mapView.longitude),
            latitude: finite(input.mapView?.latitude, previous.mapView.latitude),
            zoom: finite(input.mapView?.zoom, previous.mapView.zoom),
            bearing: finite(input.mapView?.bearing, previous.mapView.bearing),
            pitch: finite(input.mapView?.pitch, previous.mapView.pitch)
        }
    };
    return currentState;
}

export function addGuestCountry(iso: string, name: string) {
    if (!(iso in dhsRecords) || currentState.countries.includes(iso)) return currentState;
    if (currentState.countries.length >= MAX_COMPARE_COUNTRIES) return currentState;
    currentState = {
        ...currentState,
        countries: [...currentState.countries, iso],
        countryAttribution: { ...currentState.countryAttribution, [iso]: name }
    };
    return currentState;
}

export function setParticipants(participants: DataDesertsState['participants']) {
    currentState = { ...currentState, participants };
    return currentState;
}
