# Experiments Module

Growth OS includes a built-in experimentation system for tracking growth hypotheses from ideation through completion.

## Data Model

### Experiment

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | string | Experiment name |
| hypothesis | string | "If we [change], then [metric] will [improve] because [reason]" |
| status | enum | IDEA → BACKLOG → RUNNING → COMPLETED → ARCHIVED |
| channel | string? | Target channel (meta, google_ads, email, etc.) |
| primaryMetric | string | Metric being measured (conversion_rate, aov, cac, etc.) |
| targetLift | number? | Expected improvement percentage |
| reach | 1-10 | RICE: How many users affected |
| impact | 1-10 | RICE: How much impact per user |
| confidence | 1-10 | RICE: How confident in the hypothesis |
| effort | 1-10 | RICE: How much work to implement |
| riceScore | number | Computed: (R × I × C) / E |
| startDate | date? | When experiment started running |
| endDate | date? | When experiment completed |
| result | text? | Outcome description |
| learnings | text? | What was learned |
| nextSteps | text? | Follow-up actions |

### ExperimentMetric

Time-series data points collected during a running experiment:

| Field | Type | Description |
|-------|------|-------------|
| experimentId | UUID | FK to Experiment |
| date | date | Measurement date |
| metricName | string | Which metric |
| value | number | Measured value |

## Lifecycle

```
IDEA → BACKLOG → RUNNING → COMPLETED → ARCHIVED
  ↓                           ↑
  └── ARCHIVED ← ─ ─ ─ ─ ─ ─ ┘
```

- **IDEA**: Initial hypothesis captured. No commitment yet.
- **BACKLOG**: Prioritized for execution. RICE score should be filled in.
- **RUNNING**: Actively collecting data. `startDate` is set on transition.
- **COMPLETED**: Experiment finished. Fill in `result`, `learnings`, `nextSteps`. `endDate` is set.
- **ARCHIVED**: No longer relevant. Can be restored to IDEA.

## RICE Scoring

RICE is a prioritization framework:

- **Reach** (1-10): 1 = affects few users, 10 = affects all users
- **Impact** (1-10): 1 = minimal effect, 10 = transformative
- **Confidence** (1-10): 1 = pure guess, 10 = backed by strong data
- **Effort** (1-10): 1 = hours of work, 10 = months of work

**Score** = (Reach × Impact × Confidence) / Effort

Higher scores indicate better candidates for execution.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/experiments` | List all experiments (filterable by status, channel) |
| POST | `/api/experiments` | Create new experiment with RICE scoring |
| GET | `/api/experiments/:id` | Get single experiment with metrics |
| PATCH | `/api/experiments/:id` | Update experiment fields |
| DELETE | `/api/experiments/:id` | Delete experiment |
| PATCH | `/api/experiments/:id/status` | Transition status (validated state machine) |

### Create experiment

```json
POST /api/experiments
{
  "name": "Test UGC video creative on Meta",
  "hypothesis": "If we use UGC video instead of studio photos, CTR will increase 20% because UGC feels more authentic",
  "primaryMetric": "conversion_rate",
  "channel": "meta",
  "targetLift": 20,
  "reach": 8,
  "impact": 6,
  "confidence": 7,
  "effort": 3
}
```

### Transition status

```json
PATCH /api/experiments/:id/status
{ "status": "RUNNING" }
```

Valid transitions are enforced:
- IDEA → BACKLOG, ARCHIVED
- BACKLOG → RUNNING, IDEA, ARCHIVED
- RUNNING → COMPLETED, ARCHIVED
- COMPLETED → ARCHIVED
- ARCHIVED → IDEA

## Integration with AI Suggestions

When an AI Suggestion is promoted to an experiment (`POST /api/suggestions/:id/promote`):

1. A new Experiment is created with:
   - `name` = suggestion title
   - `hypothesis` = suggestion hypothesis
   - `status` = IDEA
   - RICE scores from the suggestion (impact, confidence, effort; reach left null for user to fill)
2. The suggestion status changes to PROMOTED
3. The opportunity status changes to ACTED
4. A feedback record links the suggestion to the experiment

## WBR Integration

Running experiments and recently completed experiments appear in the Weekly Business Review:
- Running experiments show name, channel, and tracked metric
- Completed-this-week experiments show name and result
