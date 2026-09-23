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

## Jake AI ↔ Work Queue ↔ Agent OS failures

31. Jake creates a delegated request without a canonical Work item.
    - Expected: every delegation has exactly one work_items record and one linked dispatch.
32. A retried Jake request creates duplicate work.
    - Expected: a stable request_id is idempotent and returns the original Work item/dispatch.
33. Delegating an existing Work item creates duplicate dispatches.
    - Expected: one active dispatch per Work item; retries return the existing dispatch.
34. A connector token can read general JakeOS work APIs.
    - Expected: denied. It may only read the scoped agent dispatch payload.
35. Two workers claim the same queued dispatch.
    - Expected: only one atomic claim succeeds.
36. An agent result is applied to a different Work item or run.
    - Expected: rejected by the dispatch/work/run linkage.
37. A draft result automatically marks human work complete.
    - Expected: never. Draft/results enter review; the Work item becomes waiting until accepted.
38. A failed agent run disappears from the Work queue.
    - Expected: Work item remains visible with failed/blocked agent state and error context.
39. Revision feedback overwrites the original request with no history.
    - Expected: feedback is recorded, dispatch returns to queued, and the same Work item remains canonical.
40. Accepting a reviewed result does not close the linked Work item.
    - Expected: explicit acceptance marks dispatch completed and Work item done.
41. Jake AI agent mode silently delegates ordinary questions.
    - Expected: delegation occurs only when Agent mode is enabled or the user explicitly says Delegate / Ask the agents to.
42. Jake reports delegated work but no dispatch was created.
    - Expected: the UI only reports success from the server response containing both Work item and dispatch ids.
43. Agent result content is inaccessible from Work.
    - Expected: Work shows assigned agent, agent state and result/review actions on the canonical item.
44. Agent OS is offline.
    - Expected: work remains safely queued and visible; no fabricated progress is shown.
45. Local fallback and external Agent OS both execute the same job.
    - Expected: atomic claim/lease permits only one executor.


## Executive market/completion operating failures

46. The Executive home becomes another task list.
    - Expected: the first screen separates executive decisions, market movement, completion pressure, delegated execution and park/defer candidates.
47. New/internal work outranks work already in progress without a market, deadline or executive-decision reason.
    - Expected: completion momentum wins unless a stronger market/deadline/decision signal exists.
48. Work already delegated to an agent remains high in Jacob's personal execution queue.
    - Expected: queued/running agent work is deprioritized; review-ready agent results are promoted.
49. An opportunity is high-fit and near deadline but invisible from the Executive home.
    - Expected: active market pursuits surface with stage, fit, deadline and concrete next action.
50. The system optimizes for open-work volume instead of closure.
    - Expected: completed-this-week, WIP pressure and finish queue are first-class executive signals.
51. A low-priority, old, undated internal item rises merely because it is old.
    - Expected: age alone never makes low-value backlog an executive priority; it becomes a park/defer candidate.
52. Work lacks a definition of done or outcome classification.
    - Expected: the Work editor can persist outcome type, market stage, completion definition, decision requirement, execution mode and completion evidence in canonical work metadata.
53. Executive UI automatically makes a consequential decision.
    - Expected: JakeOS surfaces evidence/recommendations and leaves the approve/decline/park/pursue decision to Jacob.
54. Executive dashboard cannot be understood on mobile without horizontal scrolling.
    - Expected: no page-level horizontal overflow at 390px.


## Executive operating-loop failures

55. JakeOS Web disagrees with Momentum about what is happening now or what comes next.
    - Expected: the Executive home consumes the same canonical day snapshot used by Momentum for Do Now, Up Next and the current work block.
56. A scheduled task or commitment is active, but the dashboard replaces it with an unscheduled ranked task.
    - Expected: the active day-plan item wins the Now position; ranked work is only the fallback when the schedule has no active item.
57. A critical operational signal is treated as an executive decision simply because it is severe.
    - Expected: only decision-class signals enter Decide now; operational/system exceptions stay in an exception lane with their remediation link preserved.
58. Agent-owned execution inflates Jacob's personal WIP or completion queue.
    - Expected: queued/running delegated work is excluded from personal execution pressure until it returns for review or becomes blocked in a way that needs intervention.
59. The day snapshot is empty or temporarily unavailable.
    - Expected: Now falls back to the strongest ranked Work item and Up Next degrades cleanly; no fabricated schedule is shown.
60. Market-facing execution appears in multiple equal-weight dashboard panels.
    - Expected: market opportunity and market-shipping work are grouped into one Move to market lane so the dashboard has one operating loop.
61. The operating loop is unreadable at 390px because Now, Up Next or pulse visuals overflow.
    - Expected: all command cards stack without page-level horizontal scrolling.
62. Operating-pulse bars require colour to understand their meaning.
    - Expected: every bar has a visible text label/count and an accessible label.
63. Dashboard CTAs make or imply consequential executive approvals automatically.
    - Expected: CTAs navigate to evidence/review/remediation surfaces or Ask Jake; final approval/decline remains explicit and human.
