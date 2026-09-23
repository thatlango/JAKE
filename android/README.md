# JakeOS Android migration

The standalone JakeOS Android client is in **migration-only** status.

Momentum is the canonical JakeOS Android execution app. New mobile product work should land in the `thatlango/Momentum` repository unless a migration blocker requires a change here.

## Product boundary

- **JakeOS backend** — canonical data, planning, agents, integrations, executive logic and APIs.
- **JakeOS web** — full command centre for planning, administration, analysis and configuration.
- **Momentum Android** — mobile execution: Today/Now/Next, Inbox, Ask Jake, schedule, projects, Pulse, estate signals, approvals/attention and quick actions.

## Retirement gate

Do not remove this Android source until Momentum has verified parity for the remaining required mobile capabilities and a signed production Momentum release is installed successfully. Until then:

- no new standalone JakeOS Android features;
- bug/security fixes are allowed only when required for safe migration;
- shared API contracts must remain backward compatible.
