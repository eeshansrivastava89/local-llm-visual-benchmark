---
id: ab-test-analysis
title: A/B Test Production Analysis
description: Run a full production A/B test analysis against live Supabase data, including statistical tests, guardrail checks, visualizations, and a grounded ship/don't-ship recommendation.
---

## Context

The A/B Simulator is a Pineapple Finder memory game. Variant A has 4 pineapples, Variant B has 5. Data lives in a Supabase `posthog_events` table that records player interactions from live randomized traffic.

Each row is one event. The important event types are `puzzle_started` and `puzzle_completed`. The `variant` column (A or B) is assigned per session. The `completion_time_seconds` column is only populated on `puzzle_completed` events. A single session can have multiple puzzle completions — treat each `puzzle_completed` event as a separate observation for the primary analysis, not one per session.

## Data Access

The data lives in a Supabase `posthog_events` table. Fetch it with this exact URL and headers:

```
URL: https://nazioidbiydxduonenmb.supabase.co/rest/v1/posthog_events?select=*&session_id=not.is.null&variant=not.is.null

Headers:
  apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hemlvaWRiaXlkeGR1b25lbm1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDEyMjQsImV4cCI6MjA3NjIxNzIyNH0.PjEzSI8wq74RCQpSkh7j4zhh_5nXc2nYX0M5vCjLEro
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hemlvaWRiaXlkeGR1b25lbm1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NDEyMjQsImV4cCI6MjA3NjIxNzIyNH0.PjEzSI8wq74RCQpSkh7j4zhh_5nXc2nYX0M5vCjLEro
```

Use `requests.get()` (or equivalent) with those headers. Do not read environment variables.

## Required Outputs

Write these files into the current working directory:

1. **`analysis.ipynb`** — a Jupyter notebook with the full analysis
2. **`summary.json`** — a machine-readable summary (schema below)
3. **`chart-distribution.png`** — completion time distribution by variant
4. **`chart-treatment-effect.png`** — treatment effect confidence interval
5. **`chart-completion-rates.png`** — completion/repeat rate comparison

## Required Notebook Sections

1. **Setup & data pull** — imports, Supabase API query with provided URL and headers, DataFrames
2. **Metric definitions & sanity checks** — primary KPI, guardrails, SRM test, data quality
3. **Primary analysis** — Welch's t-test, CI, Cohen's d, interpretation
4. **Guardrail analysis** — completion rate χ² test, repeat rate z-test
5. **Visualizations** — the 3 charts listed above
6. **Conclusion & recommendation** — executive summary and `summary.json`

## Not Required

- OLS regression, CUPED variance reduction, power analysis
- Outlier detection detail, KDE, daily volume/trend charts
- Extended educational commentary

## summary.json Schema

```json
{
  "status": "significant | not_significant | inconclusive",
  "recommended_variant": "A | B | null",
  "decision": "string — optional human-readable recommendation",
  "metrics": [
    { "label": "Completion Time", "value": "string", "delta": "string", "delta_direction": "up|down", "context": "string" },
    { "label": "Completion Rate", "value": "string", "delta": "string", "delta_direction": "up|down", "context": "string" },
    { "label": "Repeat Rate", "value": "string", "delta": "string", "delta_direction": "up|down", "context": "string" },
    { "label": "Effect Size", "value": "string", "context": "string" }
  ],
  "raw_stats": {
    "p_value": "number",
    "cohens_d": "number",
    "mean_a": "number",
    "mean_b": "number",
    "std_a": "number",
    "std_b": "number",
    "completion_rate_a": "number",
    "completion_rate_b": "number",
    "repeat_rate_a": "number",
    "repeat_rate_b": "number",
    "srm_p_value": "number"
  },
  "warnings": ["string"],
  "methodology": "string",
  "generated_at": "ISO 8601 timestamp"
}
```

## Scoring

Your output will be scored on:

- **Data access**: Did you query real Supabase data via the API (using the provided URL and headers)?
- **Statistical correctness**: Correct SRM test, Welch's t-test, effect size, CI?
- **Guardrails**: Did you check completion rate and repeat rate, not just the primary metric?
- **Visualizations**: 3 clear, labeled, interpretable charts?
- **Decision quality**: Does `recommended_variant` match the data? If Variant B is worse on guardrails, recommended_variant should be "A", not "B".
- **Hallucination resistance**: All cited numbers come from queried data, not invented?