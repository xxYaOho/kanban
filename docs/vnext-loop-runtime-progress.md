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

### Phase 5-6 Implemented

Implemented:

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
- Updated benchmark plan to use `benchmarks/case_replica-blenderhunt/` as the main benchmark.
- Archived origin / vNext benchmark runs under `benchmarks/archives/`.
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

## 2026-06-17

### v0.2.0 Baseline

Tagged:

- `v0.1.0`: origin baseline.
- `v0.2.0`: vNext loop model merged to main.

Benchmark case:

- Main case: `benchmarks/case_replica-blenderhunt/`
- Archives: `benchmarks/archives/`
- Summary: `benchmarks/benchmark-archive-report-20260617.md`

### P1-a Guarded Tester / Integrator Actions

Commit: `1979ee6 feat(kanban): guard tester and integrator actions`

Implemented:

- Added guarded actions:
  - `tester.submit-cases`
  - `tester.submit-report`
  - `integrator.submit-integration-report`
- `tester.submit-report` now validates:
  - test report frontmatter
  - linked reviewed test-cases document
  - non-empty case coverage
  - report coverage within case scope
  - pass coverage across all developer entries
- `integrator.submit-integration-report` now validates:
  - all developers done
  - tester pass evidence
  - integration report frontmatter
  - conflict / regression result status semantics
- `owner.closeout` now requires:
  - all developers done
  - tester done with valid pass evidence
  - required integrator evidence when requested
- `query.ts` now uses the same tester evidence gate for integrate / owner closeout hints.
- `agent-write.ts` now rejects direct writes that would bypass guarded actions:
  - `developer.status=done`
  - tester case/report/pass/fail/status fields
  - integrator report/merged/conflicts/status fields

Review:

- Multiple strict subagent rounds requested changes.
- Final subagent verdict: approve.

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

### P1-b Benchmark Run Validation

Commit: `7adf441 test(benchmarks): add blenderhunt run validation`

Implemented:

- Added `benchmarks/case_replica-blenderhunt/templates/`:
  - `task-card.md`
  - `timeline.md`
  - `result.md`
  - `metrics.json`
- Added `benchmarks/case_replica-blenderhunt/scripts/validate-run.ts`.
- Updated benchmark `AGENTS.md` to require:
  - template copy at run creation
  - stable metrics fields
  - stable visual comparison paths
  - validate-run before marking a run comparable

Validation behavior:

- Positive temporary run fixture returns `ok: true`.
- Missing screenshots return `exit 1` with missing-file errors.
- `visual.*` path escape such as `../outside.png` returns `exit 1`.
- Empty `visual.*` fixed path returns `exit 1`.

Review:

- Strict subagent first requested path-contract fixes.
- Final subagent verdict: approve.
