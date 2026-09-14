# Tuku Estate Control

JakeOS Estate Control is the release-control plane for the Tuku product estate. It exists to prevent parallel sprints, dirty trees, untracked migrations, build/version drift and deployments that cannot be traced to a verified commit.

## Source-of-truth hierarchy

1. **Git repository + canonical branch** — code truth.
2. **`estate-control/registry.json`** — estate topology, dependencies, priority and release targets.
3. **JakeOS PostgreSQL Estate Control tables** — active ownership, durable checkpoints, verified releases and audit events.
4. **CI artifact / immutable deploy SHA** — release truth.
5. **Production smoke evidence** — completion truth.
6. Chat context is advisory context only; it is never a durable checkpoint.

## State machine

```text
AVAILABLE
   │ claim
   ▼
 ACTIVE ───────────────► BLOCKED
   │                       │
   ▼                       │ retry / dependency fixed
VERIFYING                  └────────► ACTIVE
   │
   ▼
 MERGING
   │
   ▼
DEPLOYING
   │  green CI + successful smoke
   ▼
VERIFIED
```

A repository may have at most one active lock. A second workstream must join the current tranche or wait.

## Durable checkpoint rule

Work is durable only when represented by at least one of:

- pushed commit SHA;
- pull request tied to a pushed SHA;
- applied migration with recorded SHA;
- published build artifact;
- merged canonical commit;
- deployed immutable image/SHA;
- released APK/version;
- explicit blocked checkpoint.

Uncommitted local changes are never treated as progress that a later run can safely inherit.

## Release gate

Every production tranche follows the same order:

```text
inspect
→ reconcile
→ claim repository
→ implement
→ lint/typecheck/tests
→ production build
→ checkpoint pushed SHA
→ merge
→ deploy exact SHA/artifact
→ smoke realistic user journeys
→ record verified release
→ release repository lock
```

Estate Control refuses to record a verified release unless both CI and smoke status are `success`.

## Conflict and failure policy

- Never create a second implementation of a feature already represented by an active branch/PR.
- Never merge over unexplained dirty or divergent work.
- Never silently discard a prior sprint's changes.
- If the same failure persists after useful diagnosis/retry, checkpoint the blocker and move to another unblocked high-value repo.
- Shared concerns are repaired at the shared layer first: Tuku Core/Auth, identity/RBAC, shared language/components, telemetry, notifications and common contracts.
- Production data, tenant isolation, offline behavior and backwards compatibility outrank cosmetic progress.

## API

Authenticated JakeOS routes:

- `GET /api/estate/control` — complete control snapshot.
- `GET /api/estate/control/registry` — canonical registry.
- `POST /api/estate/control/repos/:repoId/claim` — acquire ownership.
- `PATCH /api/estate/control/repos/:repoId/state` — transition an active lock.
- `POST /api/estate/control/repos/:repoId/checkpoints` — record durable progress.
- `POST /api/estate/control/repos/:repoId/releases` — record a verified release and clear lock.
- `DELETE /api/estate/control/repos/:repoId/claim` — release an abandoned/superseded claim.
- `GET /api/estate/control/events` — audit trail.

Mutating calls after a claim send the returned token as `x-estate-lock-token`.

## Overnight release train

The estate automation must begin every run by re-reading actual repository, PR, CI, migration, deployment and Estate Control state. It must assume the prior run could have stopped between any two commands.

The controller should prefer finishing a coherent open tranche over opening another. If it cannot finish within the run, it pushes a checkpoint commit and records the exact next action.

## Registry governance

New product repositories are added to `estate-control/registry.json` with:

- stable `id`;
- product code;
- exact GitHub repository;
- canonical branch;
- execution priority;
- criticality;
- artifact/application kind;
- explicit dependencies;
- release target.

Dependencies must point to another registered repository ID and the graph must remain acyclic.

## JakeOS view

Open **Estate Control** from JakeOS navigation. The page shows active ownership, state, checkpoint SHA, production SHA, blockers and likely main/production drift. It complements the existing Tuku Estate telemetry dashboard: Estate says **how products are operating**; Estate Control says **how software changes are moving safely to production**.
