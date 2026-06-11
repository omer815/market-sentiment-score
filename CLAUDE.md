<!-- SPECKIT START -->
**Start here every session:** [specs/001-market-sentiment-score/HANDOFF.md](specs/001-market-sentiment-score/HANDOFF.md)

That file captures: current implementation state (MVP only), the owner's
standing preferences (keep the Mac quiet, no install commands without
asking, push to `omer815/market-sentiment-score` under the `omer815` GitHub
account, two-branch workflow), locked product decisions, environment that
is NOT provisioned, and the ordered reading list.

**Phase 1 source of truth (current architecture):**
- Design: [specs/001-market-sentiment-score/simplification-design.md](specs/001-market-sentiment-score/simplification-design.md) — single stateless Vercel app, 3 signals (Yahoo VIX + S&P 500, CNN F&G), score = round(fired/3*100). No DB, no TradingView, no second provider. S5FI + history deferred to Phase 2.
- Plan: [docs/superpowers/plans/2026-06-11-market-sentiment-simplification.md](docs/superpowers/plans/2026-06-11-market-sentiment-simplification.md)

Older multi-provider context (superseded by the Phase 1 design above):
- Spec: [specs/001-market-sentiment-score/spec.md](specs/001-market-sentiment-score/spec.md)
- Plan: [specs/001-market-sentiment-score/plan.md](specs/001-market-sentiment-score/plan.md)
- Research: [specs/001-market-sentiment-score/research.md](specs/001-market-sentiment-score/research.md)
- Data model: [specs/001-market-sentiment-score/data-model.md](specs/001-market-sentiment-score/data-model.md)
- API contract: [specs/001-market-sentiment-score/contracts/openapi.yaml](specs/001-market-sentiment-score/contracts/openapi.yaml)
- UI contract: [specs/001-market-sentiment-score/contracts/ui-contract.md](specs/001-market-sentiment-score/contracts/ui-contract.md)
- Quickstart: [specs/001-market-sentiment-score/quickstart.md](specs/001-market-sentiment-score/quickstart.md)
- Tasks: [specs/001-market-sentiment-score/tasks.md](specs/001-market-sentiment-score/tasks.md)
- Constitution: [.specify/memory/constitution.md](.specify/memory/constitution.md)
<!-- SPECKIT END -->
