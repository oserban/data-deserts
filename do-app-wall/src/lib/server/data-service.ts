import data from '../../data/datasets.json';
import world from '../../data/world.json';

type Dataset = (typeof data.datasets)[keyof typeof data.datasets];
const datasets = data.datasets as Record<string, Dataset>;

export function listDatasets() {
    return {
        meta: data.meta,
        datasets: Object.fromEntries(
            Object.entries(datasets).map(([id, dataset]) => [
                id,
                {
                    id,
                    name: dataset.name,
                    domain: dataset.domain,
                    color: dataset.color,
                    countryCount: Object.keys(dataset.records).length
                }
            ])
        )
    };
}

export function findDataset(id: string) {
    const dataset = datasets[id];
    return dataset ? { id, ...dataset } : null;
}

export function listCountries() {
    return world.features
        .map((feature) => ({
            iso: feature.id,
            name: feature.properties.name,
            datasets: Object.entries(datasets)
                .filter(([, dataset]) => feature.id in dataset.records)
                .map(([id]) => id)
        }))
        .filter((country) => country.datasets.length > 0);
}

export function getWorld() {
    return world;
}
