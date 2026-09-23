import './score-logic.js';
import data from '../data/datasets.json';
import world from '../data/world.json';
import type { AgriculturePayload, HydroPayload } from './score-logic.js';

export const scoreModel = globalThis.DataDesertsScores.create(
    data.datasets,
    (data as unknown as { agriculture?: AgriculturePayload }).agriculture,
    world.features,
    Object.keys(data.datasets.dhs.records),
    (data as unknown as { hydro?: HydroPayload }).hydro
);
export type {
    AgricultureMetric,
    AgricultureAggregation,
    HydroMetric,
    MetricResult
} from './score-logic.js';

const datasetsWithEstimates = globalThis.DataDesertsScores.withHouseholdEstimates(
    data.datasets,
    Object.keys(data.datasets.dhs.records)
);
const estimatedModel = globalThis.DataDesertsScores.create(
    datasetsWithEstimates,
    (data as unknown as { agriculture?: AgriculturePayload }).agriculture,
    world.features,
    Object.keys(data.datasets.dhs.records),
    (data as unknown as { hydro?: HydroPayload }).hydro
);
export const datasetsForEstimates = (include: boolean) =>
    include ? datasetsWithEstimates : data.datasets;
export const modelForEstimates = (include: boolean) => (include ? estimatedModel : scoreModel);
