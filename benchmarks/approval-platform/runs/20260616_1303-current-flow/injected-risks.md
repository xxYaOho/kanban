# Injected Risks

本轮不刻意注入缺陷。它作为 current-flow 完成能力基线,记录实现是否自然覆盖下列 benchmark 风险。

## R1: requester can approve own request

- Severity: Critical
- Expected detection stage: implementation test
- Affected seats: dev-api, dev-web, tester
- Expected evidence: API test rejects requester self-approval

## R2: audit log omits previous state or actor

- Severity: High
- Expected detection stage: implementation test
- Affected seats: dev-audit, tester
- Expected evidence: audit test checks actor and previousStatus

## R3: UI enabled state diverges from API permission

- Severity: High
- Expected detection stage: implementation test
- Affected seats: dev-web, dev-api, tester
- Expected evidence: view-model test matches requester/approver/owner rules

## R4: owner reopen rule diverges between API and UI

- Severity: High
- Expected detection stage: implementation test
- Affected seats: dev-api, dev-web, tester
- Expected evidence: API and view-model tests cover rejected-only owner reopen

## R5: invalid state transition mutates request

- Severity: High
- Expected detection stage: implementation test
- Affected seats: dev-api, tester
- Expected evidence: invalid transition test keeps status and audit unchanged
