# AI agents

There is no single all-purpose agent. Eight specialised agents each own one
narrow job, with a declared input schema, output schema, tool permissions and a
versioned prompt. They hand off through the database, never by calling each
other, so every hop is inspectable, replayable and rate-limitable.

```
Trend Scout → Social Researcher → Content Analyst → Engagement Scout
  → Comment Writer → Brand Guardian → Performance Analyst → Content Strategist
```

| Agent | Owns | Prompt key |
| --- | --- | --- |
| Trend Scout | Is this signal relevant to *this* client, and how urgent? | `trend_detection_prompt` |
| Social Researcher | Turning keywords into platform-appropriate queries (deterministic — query building is not a place for a model to improvise) | — |
| Content Analyst | Why did this public content perform, and what original piece could borrow its structure? | `inspiration_analysis_prompt` |
| Engagement Scout | Would joining this conversation genuinely add value? | `engagement_assessment_prompt` |
| Comment Writer | Three reply alternatives for one specific thread | `brand_comment_prompt` |
| Brand Guardian | Does this draft match the client's voice and compliance rules? | `brand_guard_prompt` |
| Performance Analyst | What is actually working, with sample sizes | `performance_analysis_prompt` |
| Content Strategist | Turning intelligence into a concrete plan; captions; the daily brief | `content_ideas_prompt`, `caption_prompt`, `daily_brief_prompt` |

Plus the in-product **Assistant** (`assistant_prompt`), which answers only from
the selected client's stored data.

## The framework

`src/ai/agents/base.js`. Every run:

1. validates its input against the agent's schema
2. resolves its prompt (most specific wins: client+platform → client → agency+platform → agency → system default)
3. calls the provider
4. **validates the model's output against the agent's output schema** — model
   output is untrusted input, and a schema failure is an agent failure
5. records the run in `agent_runs` with prompt version, model, tokens, duration
   and outcome

## The shared preamble

Prepended to every agent prompt and **not overridable by prompt management**:

1. Platform compliance — never circumvent rules, rate limits, authentication or enforcement.
2. Authenticity — no fake testimonials, no pretending to be a customer or an unaffiliated person, no invented statistics, no unsupported claims about results.
3. Human oversight — agents produce drafts and assessments; a person decides what publishes.
4. Accuracy — say what you do not know rather than filling the gap.
5. Brand safety — respect the client's stated voice, vocabulary and compliance constraints.

## Providers

- **`anthropic`** — used when `ANTHROPIC_API_KEY` is set.
- **`offline`** — deterministic heuristics (`src/ai/offline.js`). Every feature
  works without an API key or network, which is how the test suite runs and how
  the product can be demonstrated. Offline output only ever recombines data the
  system already holds; it never simulates having researched something.

Switching providers changes quality, not behaviour: both return the same shape,
and both pass through the same schema validation.

## Prompt management

Prompts are data, not code. Admins edit them in the UI; every edit publishes a
**new version** rather than overwriting the old one, and the previous version
stays in history. Overrides can be scoped to an agency, a client, or a
client-and-platform pair.

Because every agent run records its `prompt_version_id`, a change in output can
always be traced to a change in prompt.

```
GET  /api/prompts          list keys, active versions and history
POST /api/prompts/:key     publish a new version (agency or client scoped)
```

## What guards the agents

The things that decide whether something is publishable are **deterministic, not
model-based** — a gate that can be talked round is not a gate:

- the comment quality checker (`src/engines/comment-quality.js`) — ten checks,
  four of which block outright
- the content safety gate (`src/engines/safety-gate.js`) — eight checks, five of
  which block outright
- the anti-spam ceilings (`src/core/anti-spam.js`)
- the approval workflow itself

The Brand Guardian's opinion feeds these checks; it does not replace them.
