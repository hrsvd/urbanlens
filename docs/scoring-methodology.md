# Scoring methodology

## Interpretation

A rating of 10 indicates stronger available environmental/infrastructure signals; it does **not** mean "safe." A lower rating indicates more adverse or mixed observed/modelled signals; it does **not** predict an event.

Risk labels:

- `7.5–10`: Lower observed risk
- `5.0–7.4`: Moderate or mixed signals
- `0–4.9`: Higher observed risk
- confidence below 25% or no score: Insufficient evidence

## What is scored vs. what is context-only

Three metrics that were previously scored have been moved to **context-only** display because their input data cannot support a trustworthy score:

| Metric | Reason removed from scoring |
|---|---|
| Police proximity (formerly "Safety proxy") | Karnataka crime data is city/district-level only. Police station proximity has no demonstrated correlation with local crime rates. Confidence was 0.30. |
| Drain proximity | The signal is directionally ambiguous: proximity to a drain can indicate good drainage infrastructure OR higher flood exposure. It feeds into flood susceptibility as an input instead. |
| Road proximity (formerly "Estimated noise") | No decibel measurements exist at 100 m resolution. Road-distance is shown as a factual distance, not a noise score. Confidence was 0.45. |

These are still displayed in the evidence panel as factual context. The KERC electricity reliability data (SAIDI/SAIFI from the Annual Performance Review) is shown as a zone-level context fact without a score.

## Overall score

Default weights (sum to 1.0) for the nine scored metrics:

| Metric | Weight | Nature |
|---|---:|---|
| Flood susceptibility | 19% | Static + dynamic |
| Air quality | 17% | Dynamic (CPCB station or CAMS model) |
| Healthcare access | 12% | Static (OSM) |
| Public transport | 11% | Static (OSM) |
| Local walkability | 10% | Static (OSM destination diversity) |
| Schools access | 10% | Static (OSM) |
| Daily-needs retail | 8% | Static (OSM) |
| Parks & green space | 8% | Static (OSM) |
| Rainfall context | 5% | Dynamic (modelled) |

Every sub-score is normalised to 0–10 where 10 is the more favourable end
(cleaner air, closer amenities, lower flood susceptibility).

## Confidence-weighted scoring formula

Each metric's rating is adjusted toward a neutral baseline (5.0) proportional
to its uncertainty before it contributes to the composite:

```text
adjusted_rating  = raw_rating × confidence + 5.0 × (1 − confidence)
weighted_score   = Σ(adjusted_ratingᵢ × wᵢ / available_weight)
coverage         = available_weight / total_configured_weight
confidence       = weighted_source_confidence × (0.65 + 0.35 × coverage)
visible_score    = weighted_score  (clamped 0–10)
```

A metric with confidence 0.30 and raw score 7.0 contributes an adjusted rating
of 5.6, not 7.0. This prevents low-quality proxies from dominating the composite
while preserving their direction. Missing metrics are omitted entirely; they are
never treated as zero.

## Flood alert

When a cell's flood susceptibility score is below 3.5 (high-risk territory), a
prominent warning banner is shown in the intelligence panel **in addition to** the
composite score. Flood risk can be partially obscured when averaged with high-scoring
metrics; the explicit alert prevents that from happening silently.

## Air quality

PM2.5 is converted to a monotonic 10-point scale with piecewise bands. US AQI,
when present (CAMS source only), supplies a smaller secondary signal. PM2.5
contributes 70% and converted AQI 30%.

**Source priority:**

1. **CPCB/KSPCB real-time monitoring station** (when `CPCB_API_KEY` is configured) — the nearest Bengaluru station (BTM Layout, Bapuji Nagar, Silk Board, or Hebbal) is selected automatically. Physical station reading, ~3–8 km from a locality centre. Confidence: 0.72.

2. **Open-Meteo CAMS global atmospheric model** (fallback, no key required) — approximately 45 km grid; cells in the same region share the same value. Confidence: 0.55.

## Rainfall

The indicator combines modelled precipitation over the previous 24 hours and
forecast precipitation for the next 24 hours:

```text
rating = clamp(10 − (observed_mm + forecast_mm) / 10)
```

Rainfall is temporary flood context, never permanent flood risk by itself.

## Flood susceptibility

Available features are transformed to 0–10 risk contributions and re-weighted:

- documented flood-point distance: 35%
- relative elevation: 20%
- recent + forecast rainfall: 20%
- drain distance: 12%
- water-body distance: 8%
- local slope: 5%

The final cell rating is `10 − risk`. Closer historical flood evidence and lower
relative terrain raise susceptibility.

**Coverage caveat:** BBMP flood-evidence point coverage varies by locality. Absence
of a nearby point does not mean no flood risk exists. ISRO NRSC flood hazard maps
are a planned replacement for the BBMP complaint-point layer.

## Elevation

Every cell centre is sampled from Copernicus DEM GLO-90 through the Open-Meteo
Elevation API. Relative elevation is the cell elevation minus the mean of its
available eight neighbouring cells. Local slope is approximated from the maximum
neighbour elevation difference over 100 m.

This supports neighbourhood-scale terrain context. It cannot describe a basement,
kerb, raised building pad, micro-drain, or a 100 m cell's minimum elevation.

## Drain proximity (context only — not scored)

Nearest mapped stormwater-drain distance from the cell centre. Shown as a factual
distance and fed into the flood susceptibility model. Not scored separately because
proximity is directionally ambiguous.

## Road proximity (context only — not scored)

Nearest major mapped road distance. Displayed as a factual distance for manual
assessment of traffic noise and pollution exposure. No decibel measurement data
exists at 100 m resolution for this area.

## Local walkability (connectivity)

Derived from destination diversity — how many categories of daily destinations are
reachable on foot with distance decay:

```text
score = transit(2.5) + dailyNeeds(2.5) + healthcare(1.5)
      + greenSpace(1.5) + education(1.5) + amenityBonus(0.5)
```

Each category contributes its maximum points at `near` distance (150–200 m) and
tapers to 0 at `far` (500–800 m). Maximum possible: 10.0.

This replaced the older road-length formula (road metres / 75 + amenity
density) because destination diversity is a more honest walkability measure.

## Livability access metrics (schools, healthcare, transit, retail, parks)

Each is an **access proxy** derived from OpenStreetMap points during ingestion,
never a quality rating of a specific institution. For a cell centre we take the
nearest mapped feature distance and the count within a category radius (500–600 m),
then convert to 0–10 where nearer + denser scores higher.

If a category has no mapped evidence within reach of a cell, the metric is
returned as **unavailable** (null, zero confidence, dropped from the score) — it
is never treated as a zero.

## Police proximity (context only — not scored)

Nearest mapped `amenity=police` distance. Shown as a factual distance for
emergency-access context only. Karnataka crime statistics are published at
city/district level (NCRB, SCRB), not at 100 m resolution. Police station
proximity has no demonstrated correlation with local crime rates in Indian urban
contexts. It is neither labelled "safe" nor "unsafe."

## Electricity reliability (context only — not scored)

Source: KERC Annual Performance Review 2023-24 (public PDF).
BESCOM Bengaluru South zone SAIDI: 47.6 hours/year average interruption duration.
SAIFI: 38.2 interruptions/year. These are zone-level aggregates; individual feeder
and street reliability varies and is not published by BESCOM in open data.

## Unscored / unavailable metrics

- **Network quality**: No reliable public dataset provides representative 100 m mobile or broadband quality data. TRAI data is state-level; Ookla tiles require a commercial license.
- **Crime rate**: Unavailable at this resolution; see Police proximity above.
- **Property price/rent**: No source accepted; see data strategy.

## Confidence

Confidence represents evidence fitness, spatial resolution, completeness, and
model status. It is not a statistical probability that the score is correct.

Confidence affects the composite score directly: each metric's adjusted rating is
`raw × confidence + 5.0 × (1 − confidence)`. A metric with confidence 0.55
and score 8.0 contributes an adjusted rating of 6.65, not 8.0. This is visible
in the "Why this score" breakdown.
