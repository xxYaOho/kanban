# Approval Platform Benchmark Task Card

## Run Metadata

- Run ID:
- Flow: `current | vnext-default | vnext-mixed`
- Repo:
- Main worktree:
- Started at:
- Ended at:
- Owner:
- Kanban thread:
- Plan path:
- Result path:

## Agent Timing Rule

Every Agent must record a timestamp in `timeline.md` before and after each assigned step.

Use:

```bash
date +%Y-%m-%dT%H:%M:%S%z
```

Do not estimate time from memory when a timestamp can be recorded directly.

## Task

Build a small, runnable approval platform.

The platform must support:

- Approval request list.
- Approval request detail.
- `approve`, `reject`, and `reopen` actions.
- Status values: `pending`, `approved`, `rejected`.
- Actor roles: requester, approver, owner.
- Audit log for every status change.
- UI disabled state matching backend/business permission rules.
- A documented start command.
- A documented verification command or smoke procedure.

## Business Rules

- A new request starts as `pending`.
- An approver can approve or reject a pending request.
- A requester cannot approve or reject their own request.
- An owner can reopen a rejected request.
- Reopen returns the request to `pending`.
- Every state change records:
  - actor
  - action
  - previousStatus
  - nextStatus
  - createdAt
- The UI must not show an enabled action that the business rules would reject.

## Suggested Multi-Plan

Use these work items unless the flow under test requires a different split:

- `owner`: Create plan, assign seats, define acceptance criteria, close out.
- `dev-api`: Domain model, service/API behavior, permissions, audit.
- `dev-web`: List/detail UI, action state, user-visible flows.
- `dev-test`: Automated tests or smoke harness.
- `tester`: Independent verification, issue loop if needed.
- `reviewer`: Optional gate only when the flow requires it.
- `integrator`: Optional integration seat only when the flow requires it.

## Acceptance Criteria

- The application can be started from a clean checkout or copied artifact.
- The list and detail views are visible.
- `approve`, `reject`, and `reopen` can be exercised.
- The requester self-approval path is blocked.
- Audit history is visible or inspectable.
- Verification evidence is saved in `artifacts/verification/`.
- Kanban artifacts are copied into `artifacts/kanban/`.
- `result.md` and `timeline.md` are complete.

## Closeout Requirement

At the end of the run, the owner must record:

- Final app location.
- Start command.
- Verification command or smoke steps.
- Final git commit(s), if any.
- Known limitations.
- Whether the run is comparable with previous runs.
