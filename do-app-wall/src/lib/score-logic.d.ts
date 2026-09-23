export type AgricultureMetric =
    | 'dispersion'
    | 'resolution'
    | 'similarity'
    | 'availability'
    | 'coverage';
export type AgricultureAggregation = AgricultureMetric;
export type HydroMetric = Exclude<AgricultureMetric, 'coverage'>;
export type MetricResult = { value: number | null; available: number; expected: number };
export type AgriculturePayload = {
    schemaVersion: number;
    cropOrder: string[];
    status: string;
    reason: string;
    records: Record<string, Record<string, number>>;
    aggregateMetrics?: Record<string, Record<string, Record<string, unknown>>>;
    crops: Record<
        string,
        {
            name: string;
            color: string;
            records: Record<string, Record<string, number>>;
            metrics: Record<
                string,
                Record<
                    string,
                    {
                        dispersion: number | null;
                        resolution: number | null;
                        allocationSimilarity: number | null;
                        sourceAvailability: number | null;
                        complete: boolean;
                        crosswalkExactness: string;
                    }
                >
            >;
        }
    >;
};
export type AgricultureModel = {
    agriculture: AgriculturePayload;
    hydro: HydroPayload;
    metrics: Record<AgricultureMetric, { label: string; unit: string; note: string }>;
    maxima: Record<AgricultureMetric, number>;
    cropValue(
        iso: string,
        crop: string,
        metric: AgricultureMetric,
        from: number,
        to: number
    ): MetricResult;
    hydroValue(
        iso: string,
        variable: string,
        metric: HydroMetric,
        from: number,
        to: number
    ): MetricResult;
    aggregateValue(
        iso: string,
        method: AgricultureAggregation,
        from: number,
        to: number
    ): MetricResult;
    datasetValue(
        key: string,
        iso: string,
        from: number,
        to: number,
        method: AgricultureAggregation
    ): MetricResult;
    seriesValue(
        keys: string[],
        iso: string,
        from: number,
        to: number,
        method: AgricultureAggregation
    ): MetricResult;
    color(value: number | null, metric: AgricultureMetric): string;
    format(result: MetricResult, metric: AgricultureMetric): string;
    formatCoverageScore(result: MetricResult): string;
};
export type HydroPayload = {
    schemaVersion: number;
    status: string;
    reason: string;
    variableOrder: string[];
    aggregate: {
        name: string;
        products: string[];
        metrics: Record<
            string,
            Record<
                string,
                {
                    dispersion: number | null;
                    resolution: number | null;
                    allocationSimilarity: number | null;
                    sourceAvailability: number | null;
                    complete: boolean;
                }
            >
        >;
    };
    variables: Record<
        string,
        {
            name: string;
            products: string[];
            metrics: Record<
                string,
                Record<
                    string,
                    {
                        dispersion: number | null;
                        resolution: number | null;
                        allocationSimilarity: number | null;
                        sourceAvailability: number | null;
                        complete: boolean;
                    }
                >
            >;
        }
    >;
};
declare global {
    var DataDesertsScores: {
        metrics: AgricultureModel['metrics'];
        withHouseholdEstimates<T>(datasets: T, scope: string[]): T;
        create(
            datasets: Record<string, { records: Record<string, Record<string, number>> }>,
            agriculture: AgriculturePayload | undefined,
            features: Array<{ id: string; properties: { areaKm2?: number } }>,
            scope: string[],
            hydro?: HydroPayload
        ): AgricultureModel;
    };
}
