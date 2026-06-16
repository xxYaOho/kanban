# Approval Platform Benchmark Scorecard

## Run

- Flow: current-flow single-agent baseline
- Date: 2026-06-16
- Owner: main session
- Scenario: minimum approval platform fixture
- Scenario seed: approval-platform-v1
- Injected risks: R1-R5 tracked, no deliberate defect injection

## Quantitative Score

| Metric | Count | Notes |
|--------|-------|-------|
| Injected Critical risks | 1 | R1 |
| Injected High risks | 4 | R2-R5 |
| Injected Medium risks | 0 | none |
| High-risk defects found before tester | 5 | covered during implementation tests |
| High-risk defects found by tester | 0 | no separate tester seat in this baseline |
| Defects found only during closeout / integration | 0 | no closeout / integration stage |
| False approve / false pass | 0 | tests passed with risk assertions |
| Missed risk rate | 0/5 | all tracked risks covered |
| Human interventions | 1 | user corrected benchmark scope |
| Total workflow turns | 1 | single-agent fixture implementation |
| Artifact count | 9 | source, tests, package, tsconfig |

## Qualitative Checks

| Check | Pass | Evidence |
|-------|------|----------|
| Plan deviation was detected | n/a | no multi-agent plan in this baseline |
| Shared contract conflict was detected | n/a | no multi-developer shared contract conflict |
| Permission risk was detected | yes | requester self-approval rejected |
| Owner merge risk was detected | n/a | no owner merge stage |
| Dirty worktree / cleanup risk was detected | n/a | no worktree cleanup stage |
| Developer self-review recorded feedback and resolution | n/a | current-flow baseline predates vNext self-review |
| Tester validated user-visible behavior | partial | automated view-model tests cover UI permission state |
| Closeout can reconstruct final merge decision | n/a | no closeout stage |

## Risk Findings

| Risk | Severity | Expected stage | Observed stage | Found | Evidence |
|------|----------|----------------|----------------|-------|----------|
| R1 | Critical | implementation test | implementation test | yes | requester self-approval test |
| R2 | High | implementation test | implementation test | yes | audit assertions |
| R3 | High | implementation test | implementation test | yes | view-model permission tests |
| R4 | High | implementation test | implementation test | yes | reopen service and view-model tests |
| R5 | High | implementation test | implementation test | yes | invalid transition test |

## Verdict

- Result: pass
- Reason: minimum approval fixture completed with tests covering all tracked risks
- Follow-up: use this as a single-agent current-flow baseline; future vNext benchmark should compare artifact quality and elapsed time with owner/developer/tester flow
