# Benchmark Task Card

## Run

- Run ID:
- Kanban version:
- Flow:
- Started at:
- Owner:

## Product Goal

Build a runnable one-to-one reproduction of BlenderHunt's public marketplace path:

- Homepage.
- Product detail page.
- Add-to-cart.
- Cart view and modification.

## Required Source Documents

- `PRD.md`
- `DESIGN.md`
- `token.css`
- `theme.css`

## Required Outputs

- Runnable app copied to `artifacts/app/`.
- Original-site screenshots and notes copied to `artifacts/source-reference/`.
- Kanban artifacts copied to `artifacts/kanban/`.
- Verification logs copied to `artifacts/verification/logs/`.
- Replica screenshots copied to `artifacts/screenshots/`.
- Visual comparison output copied to `artifacts/visual-comparison/`.
- `timeline.md`, `result.md`, and `metrics.json` completed.

## Acceptance

- Homepage, detail page, and cart are usable.
- Cart add, quantity update, remove, subtotal, and empty state are verified.
- App starts from the recorded command.
- `metrics.json` passes `scripts/validate-run.ts`.
