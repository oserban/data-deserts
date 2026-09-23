/* Score calculations used only by the wall application; no DOM dependencies. */
(function (root) {
    'use strict';
    var metrics = {
        dispersion: {
            label: 'Allocation dispersion (coefficient of variation)',
            unit: 'coefficient of variation (CV)',
            note: 'This is the coefficient of variation: the standard deviation divided by the mean difference between the map products after each is converted to a share of the country’s mapped total. Zero means they place the mapped quantity in the same pattern; larger values mean their placement differs.'
        },
        resolution: {
            label: 'Effective resolution',
            unit: 'km',
            note: 'Map cells are merged into larger blocks until the products’ allocation differences fall below 0.10. This is the first block width where that happens. The selected window shows the largest result across its available years.'
        },
        similarity: {
            label: 'Allocation similarity',
            unit: 'overlap',
            note: 'This is the overlap between the two product maps after each is expressed as a share of the country’s mapped total. One means the maps place all of that share in the same cells; zero means they do not overlap.'
        },
        availability: {
            label: 'Source availability',
            unit: 'share',
            note: 'The share of the two required map streams with positive mapped quantity in the country. Both are required to calculate the other map-comparison metrics.'
        },
        coverage: {
            label: 'Reporting-unit coverage',
            unit: 'score',
            note: 'This combines reporting-unit density (60%) and the share of selected years with reports (40%). It describes the available census evidence, rather than the spatial crop maps.'
        }
    };
    function result(value, available, expected) {
        return { value: value, available: available, expected: expected };
    }
    function mean(values) {
        return values.length
            ? values.reduce(function (a, b) {
                  return a + b;
              }, 0) / values.length
            : null;
    }
    function blend(a, b, t) {
        return (
            'rgb(' +
            a
                .map(function (v, i) {
                    return Math.round(v + (b[i] - v) * t);
                })
                .join(',') +
            ')'
        );
    }
    function create(datasets, agriculture, features, scope, hydro) {
        agriculture = agriculture || {
            cropOrder: [],
            crops: {},
            records: {},
            status: 'unavailable'
        };
        hydro = hydro || { variableOrder: [], variables: {}, status: 'unavailable' };
        var areas = {},
            pool = {},
            memo = new Map(),
            maxima = { dispersion: 0, resolution: 0, similarity: 1, availability: 1, coverage: 1 };
        features.forEach(function (f) {
            areas[f.id] = Math.max(1, f.properties.areaKm2 || 1);
        });
        scope.forEach(function (iso) {
            pool[iso] = true;
        });
        agriculture.cropOrder.forEach(function (crop) {
            Object.keys(agriculture.crops[crop].metrics).forEach(function (iso) {
                if (!pool[iso]) return;
                Object.values(agriculture.crops[crop].metrics[iso]).forEach(function (r) {
                    if (r.complete === false) return;
                    [
                        ['dispersion', 'dispersion'],
                        ['resolution', 'resolution'],
                        ['allocationSimilarity', 'similarity'],
                        ['sourceAvailability', 'availability']
                    ].forEach(function (pair) {
                        if (Number.isFinite(r[pair[0]]))
                            maxima[pair[1]] = Math.max(maxima[pair[1]], r[pair[0]]);
                    });
                });
            });
        });
        hydro.variableOrder.forEach(function (variable) {
            var item = hydro.variables[variable] || { metrics: {} };
            Object.keys(item.metrics).forEach(function (iso) {
                if (!pool[iso]) return;
                Object.values(item.metrics[iso]).forEach(function (r) {
                    if (r.complete === false) return;
                    [
                        ['dispersion', 'dispersion'],
                        ['resolution', 'resolution'],
                        ['allocationSimilarity', 'similarity'],
                        ['sourceAvailability', 'availability']
                    ].forEach(function (pair) {
                        if (Number.isFinite(r[pair[0]]))
                            maxima[pair[1]] = Math.max(maxima[pair[1]], r[pair[0]]);
                    });
                });
            });
        });
        function coverage(records, id, iso, from, to, unknown) {
            var cacheKey = id + '|' + from + '|' + to;
            if (!memo.has(cacheKey)) {
                var totals = {},
                    active = {},
                    maximum = 0;
                scope.forEach(function (country) {
                    var sum = 0,
                        n = 0,
                        yearly = records[country] || {};
                    for (var y = from; y <= to; y++) {
                        var v = yearly[y] || 0;
                        sum += v;
                        if (v > 0) n++;
                    }
                    totals[country] = (sum / areas[country]) * 1000000;
                    active[country] = n;
                    maximum = Math.max(maximum, totals[country]);
                });
                memo.set(cacheKey, { totals: totals, active: active, maximum: maximum });
            }
            var model = memo.get(cacheKey),
                n = model.active[iso] || 0,
                years = to - from + 1;
            if (!pool[iso] || (unknown && !n)) return result(null, 0, years);
            var magnitude =
                model.maximum && model.totals[iso]
                    ? Math.log1p(model.totals[iso]) / Math.log1p(model.maximum)
                    : 0;
            return result(0.6 * magnitude + (0.4 * n) / years, n, years);
        }
        function cropValue(iso, crop, metric, from, to) {
            var item = agriculture.crops[crop];
            if (!item || !pool[iso]) return result(null, 0, to - from + 1);
            if (metric === 'coverage')
                return coverage(item.records, 'crop:' + crop, iso, from, to, true);
            var values = [],
                records = item.metrics[iso] || {};
            for (var y = from; y <= to; y++) {
                var r = records[y],
                    field =
                        metric === 'similarity'
                            ? 'allocationSimilarity'
                            : metric === 'availability'
                              ? 'sourceAvailability'
                              : metric,
                    value = r && r[field];
                if (
                    r &&
                    (metric === 'availability' || r.complete !== false) &&
                    Number.isFinite(value)
                )
                    values.push(value);
            }
            return result(
                metric === 'resolution' && values.length
                    ? Math.max.apply(null, values)
                    : mean(values),
                values.length,
                to - from + 1
            );
        }
        function hydroValue(iso, variable, metric, from, to) {
            var item = variable === 'overall' ? hydro.aggregate : hydro.variables[variable];
            if (!item || !pool[iso]) return result(null, 0, to - from + 1);
            var values = [],
                records = item.metrics[iso] || {};
            for (var y = from; y <= to; y++) {
                var r = records[y],
                    field =
                        metric === 'similarity'
                            ? 'allocationSimilarity'
                            : metric === 'availability'
                              ? 'sourceAvailability'
                              : metric,
                    value = r && r[field];
                if (
                    r &&
                    (metric === 'availability' || r.complete !== false) &&
                    Number.isFinite(value)
                )
                    values.push(value);
            }
            return result(
                metric === 'resolution' && values.length
                    ? Math.max.apply(null, values)
                    : mean(values),
                values.length,
                to - from + 1
            );
        }
        function aggregateValue(iso, method, from, to) {
            if (method === 'coverage')
                return coverage(
                    agriculture.records,
                    'agriculture:deduplicated',
                    iso,
                    from,
                    to,
                    true
                );
            var values = [],
                yearly = (agriculture.aggregateMetrics || {})[iso] || {};
            for (var year = from; year <= to; year++) {
                var r = yearly[year],
                    field =
                        method === 'similarity'
                            ? 'allocationSimilarity'
                            : method === 'availability'
                              ? 'sourceAvailability'
                              : method;
                if (
                    r &&
                    (method === 'availability' || r.complete !== false) &&
                    Number.isFinite(r[field])
                )
                    values.push(r[field]);
            }
            return result(
                method === 'resolution' && values.length
                    ? Math.max.apply(null, values)
                    : mean(values),
                values.length,
                to - from + 1
            );
        }
        function datasetValue(key, iso, from, to, method) {
            if (key === 'agriculture_maps') return aggregateValue(iso, method, from, to);
            if (key === 'hydro_maps') return hydroValue(iso, 'overall', 'dispersion', from, to);
            return coverage(
                (datasets[key] || {}).records || {},
                'dataset:' + key,
                iso,
                from,
                to,
                false
            );
        }
        function seriesValue(keys, iso, from, to, method) {
            if (keys.length === 1) return datasetValue(keys[0], iso, from, to, method);
            var values = keys
                .map(function (key) {
                    return datasetValue(key, iso, from, to, method).value;
                })
                .filter(Number.isFinite);
            return result(mean(values), values.length, keys.length);
        }
        function color(value, metric) {
            if (!Number.isFinite(value)) return '#4b5663';
            var maximum = maxima[metric] || 1,
                t = Math.max(0, Math.min(1, value / maximum));
            if (metric === 'dispersion') return blend([239, 237, 245], [106, 81, 163], t);
            if (metric === 'resolution') return blend([222, 235, 247], [33, 113, 181], t);
            if (metric === 'similarity' || metric === 'availability')
                return blend([215, 48, 39], [26, 152, 80], t);
            return t <= 0.5
                ? blend([215, 48, 39], [254, 224, 139], t * 2)
                : blend([254, 224, 139], [26, 152, 80], (t - 0.5) * 2);
        }
        function format(r, metric) {
            if (!Number.isFinite(r.value)) return 'Unavailable';
            return (
                r.value.toLocaleString(undefined, {
                    maximumFractionDigits: metric === 'resolution' ? 1 : 3
                }) +
                ' ' +
                metrics[metric].unit
            );
        }
        function formatCoverageScore(r) {
            if (!Number.isFinite(r.value)) return 'Unavailable';
            return (
                r.value.toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' coverage score'
            );
        }
        return {
            agriculture: agriculture,
            hydro: hydro,
            metrics: metrics,
            maxima: maxima,
            cropValue: cropValue,
            hydroValue: hydroValue,
            aggregateValue: aggregateValue,
            datasetValue: datasetValue,
            seriesValue: seriesValue,
            color: color,
            format: format,
            formatCoverageScore: formatCoverageScore
        };
    }
    function withHouseholdEstimates(datasets, scope) {
        var source = datasets.lsms;
        if (!source || !source.estimatedRecords) return datasets;
        var records = {};
        [source.records, source.estimatedRecords].forEach(function (input) {
            Object.keys(input).forEach(function (iso) {
                var years = records[iso] || (records[iso] = {});
                Object.keys(input[iso]).forEach(function (year) {
                    years[year] = (years[year] || 0) + input[iso][year];
                });
            });
        });
        function summary(input) {
            var years = [],
                total = 0;
            Object.keys(input).forEach(function (iso) {
                Object.keys(input[iso]).forEach(function (year) {
                    years.push(+year);
                    total += input[iso][year];
                });
            });
            return {
                countries: Object.keys(input).length,
                records: total,
                yearMin: years.length ? Math.min.apply(null, years) : null,
                yearMax: years.length ? Math.max.apply(null, years) : null
            };
        }
        var scoped = {};
        scope.forEach(function (iso) {
            if (records[iso]) scoped[iso] = records[iso];
        });
        return Object.assign({}, datasets, {
            lsms: Object.assign({}, source, {
                records: records,
                unit: 'household-member records (includes estimates)',
                description:
                    'Observed person-roster records plus estimated household members for studies without a usable roster count. ' +
                    source.estimationDescription,
                summary: summary(records),
                scopeSummary: summary(scoped)
            })
        });
    }
    root.DataDesertsScores = {
        create: create,
        metrics: metrics,
        withHouseholdEstimates: withHouseholdEstimates
    };
})(globalThis);
