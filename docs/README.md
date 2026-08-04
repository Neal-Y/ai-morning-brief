# docs/ index

Two kinds of file here. Know which one you're reading before you trust it.

**Living specs** — describe the system *as it is right now*. Kept in sync with code; if one contradicts what you see in the codebase, the doc is wrong and should be fixed in the same PR as whatever you were doing.

**Decision records** (`decisions/`) — describe a *point in time*: what was decided, why, what was rejected. Frozen the day they were written. Never edited for new facts, even if the decision was later reversed — if it was reversed, the current living docs say so and the decision record stays as-is for the historical reasoning.

Root-level docs outside this folder, for context: [`../CLAUDE.md`](../CLAUDE.md) (primary AI-agent-facing spec, read this first), [`../README.md`](../README.md) (public-facing overview), [`../AGENTS.md`](../AGENTS.md) (same role as CLAUDE.md, for non-Claude coding agents).

---

## Living specs

| File | What's in it |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The detailed mechanical reference: classifier bucket/renderLevel rules, rank+select algorithm, category taxonomy, quiz generation/validation rules, full DB schema, full API contract. CLAUDE.md/README summarize; this is where the summary bottoms out. |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | Real, verified discrepancies between what the code claims and what it does (e.g. a hardcoded value standing in for something that should be computed). Not a wishlist — only things actually wrong today. |
| [PRINCIPLES.md](./PRINCIPLES.md) | Reusable product/engineering judgment calls extracted from past retros — durable methodology, not a log of what happened. |
| [DEPLOY.md](./DEPLOY.md) | Local dev commands, GitHub Actions / Vercel deploy steps, full env var reference, Notion manual setup. |
| [FRONTEND_FIX_LOG.md](./FRONTEND_FIX_LOG.md) | Web PWA (`web/`) UI incident log — symptom → root cause → fix → guardrail. Read before touching PWA frontend code. |
| [FRONTEND_FIX_LOG_APP.md](./FRONTEND_FIX_LOG_APP.md) | Same pattern, for the React Native app (`app/`, "Sift"). Read before touching RN frontend code. |

## Decision records (`decisions/`, frozen — do not edit)

Chronological. Each file's own header states what's still accurate vs. what got overridden by later events, and points to the living doc that has current truth.

| File | Date | What it decided |
|---|---|---|
| [2026-04-13-v1-proposal.md](./decisions/2026-04-13-v1-proposal.md) | 2026-04-13 | Original V1 spec: ntfy-push pipeline. Mechanics superseded into ARCHITECTURE.md; delivery mechanism (ntfy) retired 2026-04-25. |
| [2026-04-25-handoff-web-push.md](./decisions/2026-04-25-handoff-web-push.md) | 2026-04-25 | ntfy → Web Push cutover handoff snapshot. |
| [2026-04-26-v2-design.md](./decisions/2026-04-26-v2-design.md) | 2026-04-26 | V2 product philosophy + F1-F8 feature roadmap. Roadmap sequencing stale (quiz shipped outside the plan described here); philosophy/rejected-features table still useful. |
| [2026-04-26-product-review.md](./decisions/2026-04-26-product-review.md) | 2026-04-26 | Pivot memo: Library over Quiz. Headline conclusion reversed by later events (quiz shipped anyway); durable principles extracted to PRINCIPLES.md. |
| [2026-04-26-library-proposal.md](./decisions/2026-04-26-library-proposal.md) | 2026-04-26 | Library feature design brief, written for a designer. Entry-point decision (no tab bar slot) superseded once the RN app added a 4-tab bar. |
| [2026-04-27-library-design-review-v1.md](./decisions/2026-04-27-library-design-review-v1.md) | 2026-04-27 | Mockup-level design QA notes for Library v1. Thin, UI-specific, lowest ongoing value of the set. |

---

## Adding a new doc

- Describes current, ongoing behavior that should stay accurate over time → living spec, goes directly in `docs/`, add a row above.
- Captures a decision made on a specific day, including what was rejected and why → decision record, goes in `docs/decisions/YYYY-MM-DD-slug.md`, frozen on write, add a row above.
- Unsure which one? If you'd be unhappy to find it stale in 3 months, it's a living spec. If it's supposed to stay exactly as written forever, it's a decision record.
