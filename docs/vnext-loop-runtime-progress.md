# Kanban vNext Loop Runtime Progress

## 2026-06-16

### Benchmark Baseline

Created current-flow approval platform baseline:

- Run: `benchmarks/approval-platform/runs/20260616_1303-current-flow/`
- Started: `2026-06-16T13:03:25+0800`
- Ended: `2026-06-16T13:08:47+0800`
- Wall time: `5m22s`
- Result: pass
- Tests: `8 pass / 0 fail`
- Typecheck: pass

Notes:

- A fixture-local `bun install` stalled during dependency resolution and was killed.
- The fixture was adjusted to avoid requiring fixture-local dependency install.
- This baseline measures single-agent current-flow completion, not full vNext owner/developer/tester orchestration.

### Phase 1-2 Implemented

Implemented:

- Added `owner` as a canonical role.
- Added developer status `ready_for_test`.
- Added owner status set.
- Added developer fields:
  - `self_review`
  - `review_gate_required`
- Added owner entry model:
  - `status`
  - `brief`
  - `attempt`
  - `worktree`
  - `cwd`
  - `decisions`
  - `closeout`
  - `error`
- Updated task and draft templates.
- Updated new-task normalization.
- Updated legacy migration defaults.
- Added `self-review` frontmatter contract and skeleton.
- Added `owner-closeout` frontmatter contract and skeleton.
- Updated dev-report skeleton with `self_review` and `gate_review_required`.
- Added path helpers for self-review and owner closeout.
- Updated query report discovery to include `self-review-*` and `owner-closeout-*`.

Verification:

```bash
cd skills/kanban
bun run typecheck
bun run test
bun run help
```

Result:

- `typecheck`: pass
- `test`: pass
- `help`: pass

### Phase 3-4 Implemented

Implemented:

- Added `scripts/action-write.ts` for guarded vNext actions:
  - `owner.register`
  - `owner.request-reviewer-gate`
  - `developer.submit-report`
  - `reviewer.submit-gate-review`
  - `owner.closeout`
- Added artifact frontmatter validation for developer report, self-review, review, and owner closeout.
- Added reviewer gate intent flow with `review_gate_required`.
- Updated query tester blockers for `ready_for_test`.
- Added `readyForTestTargets` in query JSON.
- Updated standby tester trigger for `ready_for_test`.
- Updated issue completion guard to accept `ready_for_test`.
- Added regression tests for:
  - owner registration
  - developer submit report + self-review
  - reviewer optional gate
  - owner closeout active integrator guard

Verification:

```bash
cd skills/kanban
bun run typecheck
bun run test
```

Result:

- `typecheck`: pass
- `test`: pass

### Phase 5-6 In Progress

Implemented in current pass:

- Added `/kanban --role owner` runtime registration:
  - default owner key/worktree is `main`
  - only one owner is allowed
  - owner registration is rejected after any seat has started
  - re-registering the existing owner refreshes `brief`
- Added regression coverage for owner registration and active-seat rejection.
- Updated query recommendations for owner and `ready_for_test` flow.
- Updated role docs for owner, developer, reviewer, and tester vNext responsibilities.
- Added `references/role-owner.md`.
- Updated `/kanban --new` docs to prompt for owner registration only when there is no owner and no active seat.
- Updated benchmark plan to use `benchmarks/replica-blenderhunt/` as the main benchmark. `approval-platform` remains a historical single-agent smoke baseline.
- Applied strict subagent review fixes:
  - owner registration now rejects any existing non-owner seat, including idle preallocated seats
  - `developer.submit-report` enforces `related_issue` when the developer owns an open issue
  - `integratorBlockedBy` no longer treats idle reviewer seats as required gates
  - benchmark docs now point to replica-blenderhunt as the main benchmark
  - README now describes the vNext `ready_for_test -> tester -> owner closeout` default flow

Verification status:

- `typecheck`: pass
- `test`: pass
- `help`: pass
