# JakeOS Executive Operating Model

JakeOS exists to increase executive decision quality and organisational throughput. It is not a place to accumulate work.

## Primary loop

**Market signal -> executive priority -> owner -> execution -> verified completion -> evidence / revenue -> learning**

Every new capability must strengthen one or more links in that chain.

## Executive home contract

The first screen must answer, in this order:

1. **What needs Jacob's decision?**
2. **What can move to market, customer, delivery or cash now?**
3. **What active work must finish before more WIP begins?**
4. **What execution is already delegated and should stay off Jacob's desk?**
5. **What should be parked, declined, narrowed or stopped?**

If a widget does not help answer one of those questions, it should not occupy executive-home space.

## Work routing

Canonical Work metadata uses these fields:

- `outcome_type`: market | delivery | decision | internal | maintenance
- `market_stage`: none | validate | sell | bid | submit | deliver | collect | retain
- `completion_definition`: observable statement of what Done means
- `decision_required`: whether an executive decision is explicitly required
- `delegation_preference`: me | delegate | agent
- `evidence_required`: artifact that proves completion

This data lives in the existing `work_items.metadata` JSONB field. No second task system is created.

## Priority doctrine

Priority is not age.

JakeOS should rank work upward when it:

- is already in progress and can be closed;
- moves revenue, a customer, a bid, a delivery or cash collection;
- requires a decision only Jacob can make;
- is an agent deliverable ready for human review;
- has a near deadline;
- has a clear definition of done.

JakeOS should rank work downward when it:

- is already delegated and executing successfully;
- is undated internal backlog with weak impact;
- is old merely because it has existed for a long time;
- is blocked but does not need an executive decision;
- represents new WIP while active WIP is above the guardrail.

## WIP guardrail

The default executive WIP limit is **3 active Doing items**.

Above the limit, the system should explicitly push toward:

- finish;
- delegate;
- stop;
- narrow scope;

before suggesting another major start.

## Decision boundary

JakeOS may:

- surface evidence;
- show trade-offs;
- recommend a next action;
- draft material;
- delegate approved execution;
- record a decision and its rationale.

JakeOS must not silently make consequential executive decisions.

## Definition of Done

A work item is not complete merely because implementation occurred.

Where applicable, Done should be backed by observable evidence such as:

- production URL + deployed version;
- successful E2E artifact;
- signed / submitted document;
- submission receipt;
- payment receipt;
- client acceptance;
- report delivered;
- verified dataset / export;
- recorded decision and downstream action.

## Portfolio rule

New product or platform work must be challenged against:

- current market evidence;
- active customer need;
- revenue potential;
- strategic reuse;
- existing unfinished commitments;
- duplicate capability already present elsewhere in the estate.

The default question is not **"Can we build this?"** but **"What current outcome justifies pulling this into WIP?"**

## Ask Jake doctrine

When asked what to do, Jake should keep the shortlist small and classify recommendations as:

- **DECIDE**
- **FINISH**
- **MOVE TO MARKET**
- **DELEGATE**
- **PARK**

The assistant should challenge novelty, internal invention and unbounded WIP rather than reward them.
