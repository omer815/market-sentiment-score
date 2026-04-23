<!--
SYNC IMPACT REPORT
==================
Version change: (template unversioned) → 1.0.0
Bump rationale: Initial ratification of the project constitution. All placeholders
replaced with concrete principles and governance rules; prior file contained only
template tokens, so this is the first real version (MAJOR 1.0.0).

Modified principles:
  - [PRINCIPLE_1_NAME] → I. Code Quality
  - [PRINCIPLE_2_NAME] → II. Testing Standards (NON-NEGOTIABLE)
  - [PRINCIPLE_3_NAME] → III. User Experience Consistency
  - [PRINCIPLE_4_NAME] → IV. Performance Requirements
  - [PRINCIPLE_5_NAME] → (removed; 4 principles requested)

Added sections:
  - Quality Gates & Delivery Standards (replaces [SECTION_2_*])
  - Development Workflow & Review Process (replaces [SECTION_3_*])
  - Governance (fully populated)

Removed sections:
  - Fifth principle slot (template had 5 by default; trimmed to 4 per user request)

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check section now maps
    to the 4 ratified principles; existing placeholder `[Gates determined based
    on constitution file]` remains valid and will be filled per-feature.
  - ✅ .specify/templates/spec-template.md — No structural change required;
    Success Criteria section already accommodates UX and performance metrics
    mandated by Principles III & IV.
  - ✅ .specify/templates/tasks-template.md — No structural change required;
    Phase categorization already supports the testing discipline (Principle II)
    and polish/perf tasks (Principle IV).
  - ✅ .specify/templates/checklist-template.md — No edits needed.
  - ⚠ No agent-specific guidance files (`.specify/templates/commands/`) exist
    in this repo; nothing to propagate.

Deferred items / TODOs: none.
-->

# Dashboard Constitution

## Core Principles

### I. Code Quality

All code merged to the main branch MUST meet a consistent, machine-enforceable
quality bar before review begins.

- Every change MUST pass the project's configured linter and formatter with zero
  warnings; formatting is not negotiated in review.
- Static type checking MUST be enabled and green; new code MUST NOT introduce
  untyped escape hatches (`any`, implicit `object`, disabled rules) without a
  comment explaining the specific constraint that forced it.
- Public functions, modules, and exported types MUST have names that make intent
  clear without a comment; comments are reserved for non-obvious *why*, not
  *what*.
- Cyclomatic complexity, duplication, and dead code MUST be surfaced by
  automated analysis; any regression above the configured thresholds blocks
  merge.
- Every change MUST either add to or preserve the repository's green build on
  the default branch — merges on red are forbidden.

**Rationale**: A dashboard is a long-lived product whose maintenance cost
dominates its initial build cost. Automated, uniform quality enforcement
prevents the slow erosion of readability and correctness that accumulates when
standards are applied inconsistently across contributors.

### II. Testing Standards (NON-NEGOTIABLE)

Tests are the primary contract for behavior; they are written *with* the code
they verify, not after.

- Every user-visible behavior MUST be covered by at least one automated test at
  the appropriate layer (unit, integration, or end-to-end).
- New features and bug fixes MUST include a failing test that demonstrates the
  gap *before* the implementation is written; the failing test MUST be visible
  in the change history (commit or PR diff).
- Integration tests MUST exercise real collaborators (database, API, browser)
  rather than mocks at system boundaries; mocks are permitted only for
  third-party services the team does not own.
- Flaky tests MUST be either fixed or quarantined within one working day of
  detection; a persistently flaky test is a failing test.
- Minimum coverage thresholds (line and branch) MUST be enforced in CI and MUST
  NOT be lowered without an accompanying amendment to this constitution.

**Rationale**: Dashboards surface data that drives decisions; silent regressions
in rendering, filtering, or aggregation can mislead users without anyone
noticing. Test-first discipline keeps the feedback loop tight and makes refactor
safety an everyday property rather than a heroic effort.

### III. User Experience Consistency

Users must experience the dashboard as one product, not a collection of screens
built by different people.

- All interactive surfaces MUST consume shared design tokens (color, spacing,
  typography, radius, elevation) and shared components from the design system;
  ad-hoc styles are prohibited outside of the design system package itself.
- Loading, empty, error, and success states MUST be handled explicitly for
  every data-backed view; no view may render a bare spinner or blank frame as
  its only non-happy-path state.
- Keyboard navigation, focus order, and ARIA semantics MUST be verified for
  every interactive component; WCAG 2.1 AA is the minimum accessibility bar.
- Copy (labels, errors, empty states, confirmations) MUST follow the project's
  voice-and-tone guide; terminology MUST be consistent across features (e.g.,
  the same entity is not called both "project" and "workspace").
- Breaking UX changes (renamed actions, moved controls, altered defaults) MUST
  be called out in the PR description and paired with a migration note for
  users when the change is user-visible.

**Rationale**: Consistency is what makes a dashboard feel trustworthy.
Divergent patterns force users to relearn the product on every screen, and
inconsistent error or empty states are the single largest source of
"is-it-broken-or-is-it-me" support tickets.

### IV. Performance Requirements

Performance is a feature with measurable, enforced budgets — not an
optimization pass done at the end.

- Every user-facing view MUST define and meet explicit budgets for:
  - **Time to Interactive (TTI)**: ≤ 2.5s on the 75th percentile for the
    reference device/network profile.
  - **Interaction latency**: ≤ 100ms p95 for input-to-visual-feedback on
    common interactions (filter, sort, navigate).
  - **API response time**: ≤ 300ms p95 for primary-data endpoints under
    expected load.
- Bundle size MUST be tracked per route; any route-level JS payload increase
  over 10% versus the previous release MUST be justified in the PR.
- Data-heavy views MUST implement pagination, virtualization, or aggregation
  server-side; rendering more than ~1,000 DOM-heavy rows client-side is
  prohibited without an explicit performance exemption.
- Performance regressions detected in CI (bundle size, Lighthouse, load tests)
  MUST block merge unless the regression is paired with an accepted
  justification recorded in the plan's Complexity Tracking table.
- Observability MUST be in place before a feature ships: user-perceived latency
  and error rates MUST be visible in production dashboards and alertable.

**Rationale**: A dashboard that is slow is a dashboard that is not used. Fixed
budgets prevent "small" additions from compounding into a degraded product, and
production observability ensures real-user performance — not lab numbers —
drives our decisions.

## Quality Gates & Delivery Standards

These gates apply to every change regardless of size.

- **CI gate**: lint, type-check, unit tests, integration tests, accessibility
  checks, bundle-size check, and Lighthouse budgets MUST all pass before a PR
  is eligible for review.
- **Review gate**: at least one reviewer other than the author MUST approve;
  reviewer MUST explicitly verify Principles I–IV against the diff and call out
  any violation.
- **Design-system gate**: any new UI pattern that cannot be expressed with the
  existing design system MUST be proposed as an addition to the design system
  *before* being used in a feature; one-off styles are not a shortcut.
- **Performance gate**: if a feature touches a page with an existing budget,
  the PR MUST include the measured numbers for the affected budgets; missing
  measurements block merge.
- **Definition of Done**: a feature is done only when tests pass, budgets hold,
  accessibility is verified, observability is wired, and user-facing copy is
  reviewed — not when the code compiles.

## Development Workflow & Review Process

- Work MUST flow through the Spec Kit pipeline: `specify → clarify → plan →
  tasks → implement`. Skipping stages is permitted only for trivial fixes
  (typos, config-only changes) and MUST be justified in the PR description.
- Every feature plan MUST include a **Constitution Check** section that
  explicitly evaluates the design against Principles I–IV, with any deviations
  recorded in the plan's Complexity Tracking table together with the simpler
  alternative that was rejected and why.
- PRs MUST be small enough to review in a single sitting; oversized PRs MUST be
  split unless a reviewer explicitly agrees the scope is indivisible.
- Breaking changes (API, UX, data model) MUST be announced in the PR
  description with a migration note and, where relevant, a deprecation window.
- Spec Kit artifacts (`spec.md`, `plan.md`, `tasks.md`) MUST be kept in sync
  with the code they describe; drift is treated as a documentation bug and
  fixed as part of the same feature branch.

## Governance

- This constitution supersedes ad-hoc conventions, individual preferences, and
  prior informal agreements. Where a team practice conflicts with this
  document, this document wins until it is amended.
- **Amendment procedure**: Proposed amendments MUST be raised as a PR that
  modifies this file, includes a populated Sync Impact Report, bumps the
  version per the policy below, and is approved by at least one maintainer
  other than the proposer. The PR description MUST describe the motivating
  problem and the expected migration impact.
- **Versioning policy**: semantic versioning applies to the constitution
  itself.
  - **MAJOR**: removal or backward-incompatible redefinition of a principle or
    governance rule.
  - **MINOR**: addition of a new principle, section, or materially expanded
    obligation.
  - **PATCH**: wording clarification, typo fix, or non-semantic refinement.
- **Compliance review**: every PR review MUST verify compliance with
  Principles I–IV; reviewers are explicitly empowered — and expected — to
  block merge on violations. A quarterly audit MUST sample merged PRs for
  constitutional compliance and surface systemic gaps.
- **Runtime guidance**: day-to-day development guidance (stack choices,
  commands, project structure) lives in `CLAUDE.md` and the Spec Kit templates
  under `.specify/templates/`. Those documents MUST be kept consistent with
  this constitution; when they conflict, this constitution is authoritative
  and the guidance docs MUST be updated.

**Version**: 1.0.0 | **Ratified**: 2026-04-23 | **Last Amended**: 2026-04-23
