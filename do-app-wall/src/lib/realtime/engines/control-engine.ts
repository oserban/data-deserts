import { throttle } from '@tanstack/pacer';

import { wallStore } from '../stores/wall-store';
import type {
    BusMessage,
    DataDesertsState,
    HelloBusMessage,
    StateBusMessage,
    WallStoreState
} from '../types';
import { BusEngine } from './bus-engine';

class ControlEngine extends BusEngine<WallStoreState> {
    private readonly broadcast = throttle(
        (state: DataDesertsState) => this.send({ type: 'state/update', state }),
        { wait: 80, leading: true, trailing: true }
    );
    private constructor() {
        super('control', wallStore);
    }
    static getInstance() {
        const singleton = globalThis as typeof globalThis & {
            __dataDesertsControl?: ControlEngine;
        };
        return (singleton.__dataDesertsControl ??= new ControlEngine());
    }
    update(patch: Partial<DataDesertsState>) {
        this.store.setState((previous) => {
            if (!patch.countries) return { ...previous, ...patch };
            return {
                ...previous,
                ...patch,
                countryAttribution: Object.fromEntries(
                    patch.countries.map((iso) => [
                        iso,
                        previous.countries.includes(iso)
                            ? (previous.countryAttribution[iso] ?? 'Presenter')
                            : 'Presenter'
                    ])
                )
            };
        });
        this.broadcast(this.snapshot());
    }
    setInteracting(isInteracting: boolean) {
        this.store.setState((previous) => ({ ...previous, isInteracting }));
    }
    protected override onMessage(message: BusMessage) {
        if (message.type !== 'state/update') return;
        const next = (message as StateBusMessage).state;
        this.store.setState((previous) =>
            previous.isInteracting ? previous : { ...previous, ...next }
        );
    }
    protected override onHello(hello: HelloBusMessage) {
        if (hello.state) this.store.setState((previous) => ({ ...previous, ...hello.state }));
    }
    private snapshot(): DataDesertsState {
        const state = this.store.state;
        return {
            yearFrom: state.yearFrom,
            yearTo: state.yearTo,
            selectedDatasets: state.selectedDatasets,
            groupedByDomain: state.groupedByDomain,
            yearlyHistograms: state.yearlyHistograms,
            detailedAgriculture: state.detailedAgriculture,
            detailedHydro: state.detailedHydro,
            includeLsmsEstimates: state.includeLsmsEstimates,
            agricultureMetric: state.agricultureMetric,
            hydroMetric: state.hydroMetric,
            agricultureAggregation: state.agricultureAggregation,
            countries: state.countries,
            mapView: state.mapView,
            countryAttribution: state.countryAttribution,
            participants: state.participants
        };
    }
}
export const controlEngine = ControlEngine.getInstance();
