# Tuku-PM — production-complete delivery contract, v1.4

## Non-negotiable invariant

For every Tuku-PM engineering task (except explicit plan/discover), JakeOS Work is NOT done when a draft PR is produced. The acceptance endpoint now requires a fresh, independently signed production verification receipt. If the signer is not configured, the proof is absent, any release evidence is mismatched, or any check failed, acceptance returns HTTP 409 without marking Work done.

This prevents false closure. It does NOT provision an autonomous release service.

## Autonomous continuation workflow

1. JakeOS Work captures a one-line task; Tuku-PM records product, canonical repo, target live URL, owner, risk tier, acceptance criteria and rollback plan.
2. An isolated coding runner creates a PR. JakeOS records IMPLEMENTED / REVIEW, not DONE.
3. An independent runner validates typecheck, build, E2E, authorisation, security/tenancy and test evidence. Failures return to FIX with owner, next action and evidence.
4. Merge only after review and policy gates; record final merged SHA (not the original base SHA).
5. External build produces an immutable artifact digest with matching commit and passing build URL. BDS web uses a checksummed static bundle; containerized products can use an OCI image digest.
6. Release manager confirms scope and risk authority, preservation of database backups, tested rollback and available headroom; deploys using the approved production release adapter.
7. Verify the exact production release and actual role-based user journey: health, data isolation, correctness, browser E2E, logs/telemetry and security. On failure, roll back the application without destroying database data and reopen the work.
8. Independent SRE / release authority signs an exact short-lived receipt binding work ID, dispatch, merged SHA, digest, prod URL, rollback, all checks and A3 approval.
9. Operator accepts JakeOS Work with signed receipt; only then status becomes DONE. Acceptance event records release SHA, URL and verification time.

Do not silently abandon work after a failed CI job, missing credentials, or pending PR. Retry bounded technical failures automatically. Escalate high-risk permissions, migrations, financial controls, new costs or release authorisation to an operator with a clear action.

## Release receipt and trust

JakeOS holds ONLY the independent issuer's Ed25519 public verification PEM, configured as TUKU_PM_RELEASE_VERIFICATION_PUBLIC_KEY_B64 (base64 encoding of the PEM). The issuer retains the private key outside JakeOS and all coding agents. No key is generated or provisioned by this PR. The signature is detached Ed25519 over the exact compact JSON encoding of production_receipt, encoded base64url.

An independently provisioned TUKU_PM_RELEASE_CONNECTOR_TOKEN grants only POST /api/connectors/v1/agents/work/:id/accept-verified. The coding observer token does not grant this route. Both browser review acceptance and the narrow release connector use the same transaction and public-key proof validation; unsigned/unverified work cannot be marked done.

Mandatory receipt:
- schema_version 1, original work_item_id and dispatch_id
- repository thatlango/TukuBDS, exact delivered GitHub PR URL
- base_sha from original agent result; release_sha from the final merged code
- build status passed with release_sha, HTTPS build URL, artifact_type (static_bundle or oci_image) and immutable SHA256 artifact digest
- deployed status live with matching source SHA, artifact_type, artifact SHA256, prior rollback digest, production HTTPS URL and deployed_at. For BDS static bundles the verifier must establish the deployed mount is /opt/tuku/apps/tukubds/dist
- checks all passed: ci, security, browser_e2e, permissions, live_health, live_user_journey, telemetry, rollback_ready
- A3-approved release_authority, scoped release_approval_ref, independent verifier_id, verified_at within one hour.

The independent issuer and delivery controller source are implemented in Tuku Agent OS PRs #9 and #10. Their privileged SRE services are not yet activated; without externally signed CI, A3, deployment evidence and private signer credentials, no receipt may be issued. For high-assurance unattended release, retain audit-grade attestation storage and replay detection.

## First pilot: TukuBDS PR #83

Draft PR https://github.com/thatlango/TukuBDS/pull/83 has not yet passed a full external build or browser E2E and is not in production. The BDS production application uses a bind-mounted web directory and the platform-controlled Compose file. Production deployment must be driven from the merged SHA with immutable evidence and safe rollback, not by dropping code files into the live directory.

## Verification

- test/tuku-pm-production-gate.test.js verifies receipt schema, signature and all release gates.
- test/tuku-pm-production-accept-route.test.js simulates the actual route and ensures no completion SQL runs on invalid or missing proof.
- test/tuku-pm-release-connector-auth.test.js verifies release-only bearer scope and legacy token isolation.
- The production JakeOS image must include both changed server files and be released through production readiness standards, with rollback and live smoke. A merged PR alone is NOT live enforcement.

## Live BDS packaging confirmed 21 October 2026

The current BDS web Docker container is nginx:1.27-alpine with a read-only bind mount at /usr/share/nginx/html from /opt/tuku/apps/tukubds/dist. The /opt/tuku/apps/tukubds path is a symlink to a dated release directory. Therefore a real TukuBDS release receipt must carry artifact_type=static_bundle, the SHA256 of the immutable compiled web artifact, and independently verified equality with the contents served through this mount. It must not substitute the generic nginx base-image ID for the application artifact digest. A switch must keep the previous release directory and support restoration without database rollback.
