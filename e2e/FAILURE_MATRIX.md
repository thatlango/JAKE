# JakeOS Command Center V2 — E2E Failure Matrix

These failure modes are defined **before implementation** and drive the command-center build.

## Data and truth failures

1. /api/overview succeeds but one nested metric is null or missing.
   - Expected: render 0 or an explicit unavailable state, never NaN, undefined, or a blank card.
2. One secondary endpoint fails while the dashboard overview succeeds.
   - Expected: the affected panel degrades locally; the whole command center remains usable.
3. Estate telemetry is unavailable or stale.
   - Expected: show unavailable/stale status with last-known context; do not label products healthy without evidence.
4. Finance values use mixed currencies.
   - Expected: do not silently add unlike currencies; only aggregate a supported/common currency.
5. Opportunity stages contain unknown values.
   - Expected: unknown values fall into an Other/unclassified treatment rather than disappearing.
6. Agent telemetry has no runs yet.
   - Expected: show a zero-state roster/connection message, not fabricated activity.
7. Agent event timestamps arrive out of order.
   - Expected: timeline is sorted by event time and remains readable.
8. Duplicate agent events are ingested.
   - Expected: idempotency prevents duplicate activity rows.
9. A run is stale with no recent heartbeat.
   - Expected: surface Stale/Needs attention, not Working.
10. A decision is unresolved.
    - Expected: surface it prominently without auto-approving.

## Visual and navigation failures

11. At 1600x1000, KPI cards or charts overflow the viewport horizontally.
12. At 390px mobile width, cards overlap, text clips, or page-level horizontal scroll appears.
13. A chart has no accessible title/label or cannot be understood without colour alone.
14. Dense numbers use inconsistent formats, making scanning difficult.
15. Navigation loses the current module after browser back/forward.
16. A command-center card links to the wrong JakeOS module.
17. Sidebar becomes longer than the viewport without being scrollable.
18. Alerts/critical states are visually indistinguishable from normal states.
19. Empty charts render broken SVG paths or divide-by-zero values.
20. Search/command bar or profile controls obscure content at narrow widths.

## Agent-command-center failures

21. Agents screen renders fabricated sample agents when the API returns none.
22. Agent states use inconsistent vocabulary.
   - Canonical: working, waiting, queued, blocked, completed, failed, stale.
23. A run claims complete without an artifact/evidence reference when evidence is required.
24. A blocker is buried only in a timeline rather than surfaced in the run summary.
25. An agent decision can be actioned without the authenticated JakeOS boundary.
26. Event ingestion accepts an unscoped/general JakeOS token instead of a dedicated connector token.

## Regression / whole-JakeOS treatment

27. Existing Work, Opportunities, Estate, Operations, Finance, Payments, Accounts, Integrations and Alerts modules become unreadable after shared visual-system changes.
28. Shared panels/tables/forms lose focus indicators or adequate contrast.
29. Existing action buttons become visually secondary when they are the page's primary action.
30. Existing mobile navigation no longer exposes the Agents module.

## Required E2E evidence artifact

Each CI run must produce a repeatable evidence bundle:
- Playwright HTML report;
- trace on failure;
- failure screenshot;
- failure video;
- a successful command-center screenshot captured by the test;
- browser/project metadata in the Playwright report.

The build is not considered verified merely because the React bundle compiles.
