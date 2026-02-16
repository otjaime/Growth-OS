# AI Suggestions Module

Growth OS includes an AI-powered suggestion engine that detects anomalies, classifies them into opportunities, and generates actionable experiment suggestions.

## Architecture

```
Metrics → Signal Detection → Opportunity Classification → Suggestion Generation
                                                              ↓
                                                     User Feedback Loop
                                                     (Approve/Reject/Promote)
```

### Pipeline Stages

1. **Signal Detection** (`detectSignals`): Analyzes week-over-week metrics to find anomalies
2. **Opportunity Classification** (`classifyOpportunities`): Groups related signals into typed opportunities
3. **Suggestion Generation**: Creates actionable experiment suggestions (via AI or rule-based fallback)

## Signal Detection

Signals are detected from the `AlertInput` plus funnel and session data:

- **Alert-based signals**: All 7 alert rules (CAC spike, CM decline, MER deterioration, etc.)
- **Metric delta signals**: Significant WoW changes in AOV, sessions, conversion rates
- **Funnel drop signals**: Step-by-step funnel analysis (session→PDP→ATC→checkout→purchase)

Input: `SignalInput` (extends `AlertInput` with AOV, sessions, funnel CVR data)
Output: Array of `Signal` objects with type, severity, and metric context

## Opportunity Types

| Type | Description | Triggered By |
|------|-------------|-------------|
| EFFICIENCY_DROP | Marketing efficiency declining | MER deterioration, CAC spike |
| CAC_SPIKE | Customer acquisition cost spiking | CAC increase alert |
| RETENTION_DECLINE | Customer retention falling | D30 retention drop |
| FUNNEL_LEAK | Conversion funnel has a bottleneck | Funnel step drop > threshold |
| GROWTH_PLATEAU | Growth is stalling | Revenue flat, sessions flat |
| CHANNEL_IMBALANCE | Spend allocation is suboptimal | Channel CAC variance |
| QUICK_WIN | Low-hanging fruit opportunity | High-ROAS channel underinvested |

## Suggestion Generation

### AI-Generated (when OpenAI configured)

Uses `gpt-4o-mini` to generate 2-3 experiment suggestions per opportunity:
- Analyzes opportunity context + current KPI metrics
- References playbook (completed experiments with learnings)
- Returns structured suggestions with hypothesis, channel, metric, and RICE scores

### Rule-Based Fallback

When AI is not configured, uses `getDemoSuggestions(type)` to return pre-written suggestions per opportunity type.

### Demo Mode Fallback

When in demo mode and zero signals are detected (smooth data), the system injects 3 pre-built opportunities:
1. **Meta Ads efficiency declining** (EFFICIENCY_DROP)
2. **Checkout funnel drop** (FUNNEL_LEAK)
3. **Retargeting ROAS opportunity** (QUICK_WIN)

## Suggestion Types

| Type | Source |
|------|--------|
| AI_GENERATED | Created by OpenAI based on opportunity context |
| PLAYBOOK_MATCH | Matched from historical experiment learnings |
| RULE_BASED | Generated from predefined rules |

## Feedback Loop

Users can take these actions on suggestions:

| Action | Effect |
|--------|--------|
| APPROVE | Marks suggestion as approved, opportunity as reviewed |
| REJECT | Marks suggestion as rejected, opportunity as reviewed |
| MODIFY | Keeps suggestion pending for iteration |
| PROMOTE | Creates an Experiment from the suggestion |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/signals/detect` | Run signal detection (returns ephemeral signals) |
| GET | `/api/opportunities` | List persisted opportunities with suggestions |
| POST | `/api/opportunities/generate` | Full pipeline: detect → classify → generate |
| GET | `/api/suggestions` | List suggestions (filter by status/opportunity) |
| POST | `/api/suggestions/:id/feedback` | Record approve/reject/modify feedback |
| POST | `/api/suggestions/:id/promote` | Promote suggestion to experiment |

### Generate opportunities

```bash
curl -X POST http://localhost:4000/api/opportunities/generate
```

Response:
```json
{
  "opportunities": [...],
  "signalsDetected": 3,
  "opportunitiesCreated": 2,
  "suggestionsGenerated": 5,
  "aiEnabled": true
}
```

### Promote suggestion to experiment

```bash
curl -X POST http://localhost:4000/api/suggestions/:id/promote \
  -H "Content-Type: application/json" \
  -d '{"notes": "Looks promising, let us test it"}'
```

## WBR Integration

The Weekly Business Review includes:
- Count of pending opportunities
- Count of pending suggestions awaiting review
- Displayed in the "AI Insights" section of the WBR narrative
