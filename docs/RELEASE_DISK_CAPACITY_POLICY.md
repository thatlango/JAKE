# JakeOS VPS disk-space release threshold

Effective decision: 22 October 2026.

- **Minimum free space:** **10 GiB (10,737,418,240 bytes)** on the target filesystem, checked before starting deployment and again after deployment.
- **Previous planning threshold:** 20 GiB; superseded for JakeOS releases.
- **Not a waiver of other release checks:** independent CI, change authorization, database migration safeguards, artifact integrity, security checks, functional acceptance, and signed production receipt remain mandatory.
- Release controller must evaluate the available filesystem bytes (not rounded `df -h` output), and stop if below the threshold.
- If space is below 10 GiB or deployment projects to exhaust available space, do not deploy. Reclaim regenerable caches first and confirm rollback assets, active Docker images/volumes, databases and secrets remain intact.
- Record before/after capacity, released SHA, deployment receipt and verifier in release evidence. No work item closes on a merge alone.

This file records the approved release policy. It does not itself reconfigure a separate VPS release controller, which must consume the same threshold.
