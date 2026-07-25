# Scoring methodology

## Interpretation

A rating of 10 indicates stronger available environmental/infrastructure signals; it does **not** mean “safe.” A lower rating indicates more adverse or mixed observed/modelled signals; it does **not** predict an event.

Risk labels:

- `7.5–10`: Lower observed risk
- `5.0–7.4`: Moderate or mixed signals
- `0–4.9`: Higher observed risk
- confidence below 25% or no score: Insufficient evidence

## Overall score

Default weights:

| Metric | Weight |
|---|---:|
| Air quality | 25% |
| Flood susceptibility | 30% |
| Drain context | 15% |
| Rainfall context | 10% |
| Estimated environmental noise | 10% |
| Connectivity | 10% |

For available metrics:

```text
available_weight = Σ configured_weightᵢ
weighted_rating = Σ(ratingᵢ × configured_weightᵢ / available_weight)
coverage = available_weight / total_configured_weight
confidence = weighted_source_confidence × (0.65 + 0.35 × coverage)
visible_score = weighted_rating × modest confidence guard × weakest-source guard
```

Unavailable metrics are omitted, not treated as zero. The coverage reduction is visible in confidence. The score receives only a small evidence-quality adjustment so one low-confidence source cannot decide the cell.

## Air quality

PM2.5 is converted to a monotonic 10-point scale with piecewise bands. US AQI, when present, supplies a smaller secondary signal. PM2.5 contributes 70% and converted AQI 30%.

The source for Bengaluru is the approximately 45 km CAMS global atmospheric-model grid. The value is modelled outdoor regional context and has 55% geographic confidence. It is not an indoor or street-level reading.

## Rainfall

The indicator combines modelled precipitation over the previous 24 hours and forecast precipitation for the next 24 hours:

```text
rating = clamp(10 - (observed_mm + forecast_mm) / 10)
```

Rainfall is temporary flood context, never permanent flood risk by itself.

## Flood susceptibility

The feature contract is:

```ts
type FloodFeatures = {
  distanceToKnownFloodPointMeters: number | null;
  distanceToDrainMeters: number | null;
  distanceToLakeMeters: number | null;
  relativeElevationMeters: number | null;
  localSlopeDegrees: number | null;
  rainfallLast24HoursMm: number | null;
  forecastRainfall24HoursMm: number | null;
};
```

Available features are transformed to 0–10 risk contributions and re-weighted:

- documented flood-point distance: 35%;
- relative elevation: 20%;
- recent + forecast rainfall: 20%;
- drain distance: 12%;
- water-body distance: 8%;
- local slope: 5%.

The final cell rating is `10 - risk`. Closer historical flood evidence and lower relative terrain raise susceptibility. Drain proximity contributes only modestly because a drain can be infrastructure, exposure, or both.

Static heat surfaces use the same features without dynamic rainfall and weight local terrain more heavily. The detailed selected-cell result is the authoritative version.

The explanation names the strongest available signals and ends with “It is an indicator, not a flood prediction.”

## Elevation

Every cell centre is sampled from Copernicus DEM GLO-90 through the Open-Meteo Elevation API. Relative elevation is the cell elevation minus the mean of its available eight neighbouring cells. Local slope is approximated from the maximum neighbour elevation difference over 100 m.

This supports neighbourhood-scale terrain context. It cannot describe a basement, kerb, raised building pad, micro-drain, or a 100 m cell’s minimum elevation.

## Drain context

The value is nearest mapped-drain distance from the cell centre. The rating is deliberately non-monotonic: very close geometry is not automatically “bad,” and large distance is not automatically “good.” The explanation exposes this ambiguity.

## Estimated environmental noise

This is a proxy, not a sound level. Adverse exposure rises with:

- proximity to major mapped roads;
- mapped commercial/high-footfall places;
- bus stops;
- construction-tagged objects.

The confidence is 45% because traffic volume, time of day, sound barriers, building orientation, height, and measured decibels are absent.

## Connectivity

The derived rating combines road-centreline length inside the cell, nearby mapped amenities, and public-transport stops. It does not include measured journey times, congestion, footpath quality, or service frequency.

## Unscored metrics

- Network quality: unavailable; excluded.
- Mapped amenities count: context only; excluded.
- Construction tags: context only; excluded.
- Property price/rent: feature flag remains off; no source was accepted.

## Confidence

Confidence represents evidence fitness, spatial resolution, completeness, and model status. It is not a statistical probability that the score is correct.

Static OSM-derived metrics have moderate confidence because mapping completeness varies. Regional atmospheric data has lower geographic confidence. A source outage results in an unavailable metric, never a carried-forward random value.
