# Tuku-PM estate release control — v1.2 infrastructure tranche

**Implemented 22 October 2026.** These are shared controls, not authorization to deploy.

## What is running

- `tuku-pm-estate-drift.timer`: read-only recurring check every ~30 minutes (root-owned installed code executed by unprivileged `sentinelx`).
- `estate_release_guard.py`: compares Docker image tags **and image IDs**, source-revision/repository labels, ordered Compose paths, SHA-256 of every Compose file, running and health states, disk headroom, and optional HTTPS readiness probes. It records a report; never changes production.
- `estate-release-registry.json`: canonical observed baseline of LendFlow, JakeOS and Tuku BDS. Captured from actual running VPS containers on 2026-10-22; contains hashes/paths, no credentials or resolved environment-variable values.
- `estate_release_intent.py`: generalized **read-only** exact-source release-intent gate using scoped GitHub read access and independently signed CI and A3 Ed25519 evidence. It checks a merged PR, source tree, artifact digest, financial/security/E2E checks, approval expiry, Work-item identity, and rollback digest. It cannot deploy and cannot issue an independent production receipt.
- `test_release_controls.py`: 17 self-contained tests with ephemeral keys and injected fake GitHub state. Tests include forged/tampered CI, stale approval, unmerged PR, mismatched merge tree, missing E2E/financial evidence, changed Compose files, image drift and missing provenance.

## Operational status

| Product | Drift observation | Automatic release |
|---|---|---|
| LendFlow | Baseline healthy at capture. 17 Compose files, SHA-labelled matching web/API/worker | **Disabled**: independent signed CI + receipt issuer absent |
| JakeOS | Observed; deployed image lacks a canonical git revision label | **Disabled**: monitoring only |
| Tuku BDS | Observed; running Nginx/Node image labels lack canonical git revision | **Disabled**: monitoring only |

The old BDS PR #83-specific controller remains **unchanged**, still scheduled as an evidence-only process, not an estate controller. It must not be described as a functioning multi-product release service.

## Where installed

Version-controlled design/source lives at `thatlango/JAKE` `ops/release-control/` (feature branch under review). On the VPS:

- Root-owned runtime program: `/opt/tuku/agent-os/scripts/estate_release_guard.py`
- Root-owned static registry: `/opt/tuku/agent-os/ops/estate-release-registry.json`
- Root-owned **inactive** generic gate: `/opt/tuku/agent-os/scripts/estate_release_intent.py`
- Timer units: `/etc/systemd/system/tuku-pm-estate-drift.{service,timer}`
- Audit/report staging: `/opt/tuku/work/tuku-autonomy/release-control/last-report.json`

The report is an observation, **not** a signed receipt. A matching image label alone is not proof of how source code was built.

## Checks

```bash
sudo systemctl status tuku-pm-estate-drift.timer
sudo systemctl start tuku-pm-estate-drift.service
sudo journalctl -u tuku-pm-estate-drift.service -n 40 --no-pager
python3 -m unittest -v test_release_controls
python3 estate_release_guard.py --registry /opt/tuku/agent-os/ops/estate-release-registry.json --probe
```

When any service tag, image digest, revision, Compose file content or ordering changes without an approved baseline update, the monitor exits with drift status 2 and systemd records a failed check. Disk space below 5.5 million KiB also fails. Automated replacement of baselines is intentionally **not allowed**: update only after signed release verification and review. Do not copy resolved Compose output containing environment secrets into GitHub.

## Release-intent contract

Before a release intent may be emitted, the shared gate requires:

1. A registry-listed product in `release_control_candidate` mode.
2. A Work ID and exact production target, risk and immutable artifact+rollback digests.
3. Fresh Ed25519-signed CI evidence from an allowed independent provider and *all* required checks: build, integration, browser E2E, security, tenant permissions, financial, migration compatibility and restore-ready rollback.
4. Separate fresh Ed25519-signed A3 approval bound to exactly the same repository, merged commit, artifact, Work item, risk and environment.
5. Live read-only GitHub confirmation that the PR is merged to `main` and the merge commit's git tree is the expected source tree.
6. Explicitly enabled `automatic_deploy_enabled` for that product (currently **false for all**), for intent emission. No release adapter is activated.

A separate restricted release adapter must still validate the signed evidence, verify built image digests, take and **restore-test** backups, deploy, and generate signed deployment evidence. An independent issuer must verify actual production user journeys before it signs a receipt. Only the receipt verifier in JakeOS may close a Work item.

## Security limitations and next milestones

- The CI signer, A3 signer, deployment signer and receipt-issuer identities **are not provisioned for general estate use**. Do not set activation flags to true as a workaround.
- The secure multi-product deploy adapter is **not** implemented/activated; the LendFlow cutover of 22 Oct was a guarded one-off. The BDS issuer remains specific to a static BDS artifact.
- Post-release authenticated user-journey checks and independent artifact provenance are not yet automated.
- JakeOS and BDS require source-revision attestations and accepted golden deployment manifests before eligibility.
- Compose overlay consolidation (17 LendFlow files) remains a separate, change-controlled release; do **not** flatten `docker compose config` with expanded secrets into public or source-controlled artifacts.
- GitHub Actions incident #77 remains unresolved; independently signed alternative CI can be used only after its trust chain is implemented, not because unsigned test logs exist.
- Add real-time alert delivery and an execution controller that persists and resumes prompt-driven jobs. The monitor currently writes reports and journals only.

**Activation rule:** fail closed. No production deploy and no JakeOS "Done" from the monitor, a passed unit test, a merged PR, or an unsigned technical report.

## Stage 2: read-only deployment rehearsal (22 October 2026)

`estate_deploy_preflight.py` is deployed as root-owned **inactive** code under `/opt/tuku/agent-os/scripts/`. It accepts an approved product's release request plus a local immutable-image candidate manifest, and reconstructs candidate/rollback Compose overlays in memory without executing Docker Compose.

It requires exactly the registered containers, source and repository provenance labels, an exact SHA-256 digest of the candidate image manifest bound to the release request, local Docker image ID parity, an unchanged healthy production baseline, enough disk space, and **actual rollback tag-to-image-ID parity**. It never changes containers and always returns `automatic_deployment_permitted: false`. This is not a deploy adapter or signed release authorization.

**Verification:** 10 additional failure-path tests (27 total controls) passed. The actual LendFlow web/API/worker images and 17 Compose paths passed a read-only structural release rehearsal. Evidence held at `/opt/tuku/work/tuku-autonomy/release-control/live-rehearsal-report.json`.

Usage:

```bash
python3 /opt/tuku/agent-os/scripts/estate_deploy_preflight.py \
  --registry /opt/tuku/agent-os/ops/estate-release-registry.json \
  --request /opt/tuku/work/tuku-autonomy/release-control/live-rehearsal-request.json \
  --candidate /opt/tuku/work/tuku-autonomy/release-control/live-rehearsal-candidate.json
```

**Next security boundary:** build a distinct root-controlled production adapter that independently rechecks signed CI and A3 evidence, runs real backup+restore and migrations, performs a guarded Compose switch with rollback and then emits independently signed deployment proof. Do not allow this rehearsal code or its output to stand in for that authority.
