# Replica BlenderHunt Benchmark Archive Report

Created: 2026-06-17T16:49:51+0800

## Purpose

保留 `skill-kanban` origin 与 vNext 两次 BlenderHunt 复刻 benchmark 的完整外部运行记录,用于后续复查流程效率、视觉还原质量和 artifact 完整度。

## Archives

| Run | Version | Source Directory | Archive | Size | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| origin | v0.1.0 | `/Users/teatao/Projects/benchmark-skill-kanban-origin-20260617141059` | `benchmarks/archives/benchmark-skill-kanban-origin-20260617141059.tar.gz` | 39M | `d237d470ef2c2779024071c199ff092dd74c0c149a4434df7c9e575ce572dbe7` |
| vNext | v0.2.0 | `/Users/teatao/Projects/benchmark-skill-kanban-next-20260617103630` | `benchmarks/archives/benchmark-skill-kanban-next-20260617103630.tar.gz` | 13M | `11afbf844677eff2156b8c8929aa3393a92df056e28d7e5ba94b96787f2612dc` |

The archives intentionally exclude `.git` directories. Benchmark source files, run artifacts, screenshots, visual comparison outputs, kanban artifacts, and verification logs remain included.

## Visual Metric Summary

Both runs were compared against `https://blenderhunt.com/` using `1280x2744` screenshots.

| Run | Comparison | RMSE | MAE | AE |
| --- | --- | ---: | ---: | ---: |
| origin | original homepage vs origin app | `16995.4 (0.259333)` | `8988.23 (0.137152)` | `3.23537e+06 (0.921149)` |
| vNext | original homepage vs vNext app | `16311.1 (0.248892)` | `8355.47 (0.127496)` | `3.06143e+06 (0.871626)` |

Lower values are closer. Under this shared screenshot size, vNext is modestly closer to the original page across RMSE, MAE, and AE.

## Key Files Inside Archives

### origin

- `replica-blenderhunt/runs/20260617_1425-multi-plan/timeline.md`
- `replica-blenderhunt/runs/20260617_1425-multi-plan/result.md`
- `replica-blenderhunt/runs/20260617_1425-multi-plan/artifacts/visual-comparison/metrics-1280x2744.json`
- `replica-blenderhunt/runs/20260617_1425-multi-plan/artifacts/kanban/`

### vNext

- `runs/20260617_1100-kanban-dev/timeline.md`
- `runs/20260617_1100-kanban-dev/result.md`
- `runs/20260617_1100-kanban-dev/artifacts/metrics/home-original-vs-replica-1280x2744-metrics.json`
- `runs/20260617_1100-kanban-dev/artifacts/kanban/`

## Notes

- `v0.1.0` marks the origin baseline before vNext was merged.
- `v0.2.0` marks the merged vNext loop model.
- The current benchmark case template lives at `benchmarks/case_replica-blenderhunt/`.
- `benchmarks/approval-platform` was removed separately by Human and is not part of this archive report.
