# JakeOS Revenue Mission — USD 10K / 30 Days

## Objective

The active mission runs **27 September–26 October 2026**.

- Cash collected: **USD 10,000**
- Contracted value: **USD 20,000**
- Proposal value: **USD 50,000**
- Gross active pipeline: **USD 130,000**

JakeOS is the system of record. Momentum is the daily execution surface. The Revenue Mission is not a second CRM or task system.

## Operating chain

```text
Market signal / buyer
        ↓
Canonical Opportunity
        ↓
Revenue Sprint Account
        ↓
Named next action
        ↓
Revenue Sprint Action
        ↓
Canonical Work item
        ↓
Momentum Today / Focus
        ↓
Result + evidence
        ↓
Stage / proposal / contract / invoice / cash update
```

A lead is not useful merely because it exists. Every live account must have a named next action and date. Every material next action should be represented as a Revenue Sprint Action so it reaches canonical Work and Momentum.

## Surfaces

### Revenue Mission → Command

Use this as the executive commercial home.

It answers:

1. How much cash has actually been collected?
2. What is contracted?
3. What value is at proposal stage?
4. What is the gross and weighted pipeline?
5. Which actions are due or overdue?
6. Which accounts are the shortest credible route to 30-day cash?

The **Close next** queue is ranked by expected 30-day cash, not prestige.

### Revenue Mission → Plan & targets

This replaces the former standalone **Revenue plan** module. It is the durable planning layer inside the same mission workspace.

Maintain:

- quarterly and annual revenue targets;
- confirmed, pending and projected revenue streams;
- recurring and one-time operating costs;
- mission operating calendar;
- funnel distribution across commercial stages.

The durable plan and the active mission are intentionally shown together: targets and cost assumptions explain the required commercial pressure; the mission turns them into named accounts, dated actions, contracts, invoices and cash.

Legacy `/?module=finance` links resolve to `/revenue-mission?view=plan`.

### Revenue Mission → Accounts

This is the account operating table.

Maintain:

- lane: Cash now / Tender upside;
- relationship;
- commercial stage;
- pipeline value;
- probability;
- 30-day cash target;
- proposal status;
- contracted value;
- cash collected;
- mobilization assumption;
- contact;
- risk;
- next action and next-action date.

Use **Create commercial action** for work that must actually happen. These actions project into canonical Work automatically.

### Opportunities

Opportunities remains the canonical demand and bid workspace. A Revenue Sprint Account links to a canonical Opportunity; sprint stage, value and next-action changes synchronize back to that Opportunity.

### Work

Revenue actions are projected into `work_items` with the JakeOS executive metadata contract:

- `outcome_type`
- `market_stage`
- `completion_definition`
- `decision_required`
- `delegation_preference`
- `evidence_required`

They receive maximum impact and strategic weight for the duration of the sprint. Critical actions are pinned.

### Momentum

Momentum does not get a separate revenue database. It receives Revenue Mission work through normal JakeOS Work ranking.

The daily mobile loop is:

**DO NOW → UP NEXT → complete/defer → result syncs to Revenue Mission.**

Keep the normal executive WIP limit of **three Doing items**. Revenue pressure is not permission to start everything.

## Working with Jake inside JakeOS

Desktop **Ask Jake** reads the unified Revenue Mission snapshot, including durable targets/revenue-plan assumptions, current Work, Opportunities, accounts, actions and cash conversion.

Useful prompts:

- “What are the three moves most likely to produce cash fastest?”
- “Which accounts should I personally push today?”
- “What should I park so I stay within the three-item WIP limit?”
- “Which deal needs a proposal, decision ask, invoice or collection action next?”

Momentum Jake also receives the active sprint summary, due actions and Close Next accounts.

## Working with ChatGPT

JakeOS exposes a scoped MCP boundary at:

```text
POST /mcp/revenue-sprint
```

It uses the existing authenticated machine boundary and does not expose general JakeOS browser APIs.

Available tools:

### `revenue_sprint_get`

Read the active sprint, targets, summary, accounts, due actions and Close Next list.

### `revenue_account_update`

Update internal commercial state such as:

- stage;
- probability;
- pipeline and 30-day cash values;
- next action/date;
- proposal status;
- contract value;
- collected cash;
- mobilization;
- contact/risk/notes.

Linked Opportunity state is updated in the same operation where applicable.

### `revenue_action_create`

Create an internal commercial action. The database bridge projects it into canonical Work, allowing Momentum to execute it.

### `revenue_action_complete`

Complete the revenue action and attach a result. Completion synchronizes with canonical Work.

The MCP boundary intentionally does **not** send email, submit bids, sign agreements, approve payments or move money.

## Daily cadence with ChatGPT

### 07:30 — Mission brief

Ask:

> Run my USD10K Revenue Mission brief from JakeOS. Reconcile cash, contracts, proposals, due actions and Close Next. Give me no more than three Doing items. Identify what you can prepare yourself and what requires my action.

Expected result:

- current gap to USD 10K;
- three highest-leverage moves;
- one explicit PARK/STOP recommendation where WIP is excessive;
- required drafts/research prepared;
- internal JakeOS actions created or updated.

### After each buyer interaction

Tell ChatGPT the outcome or let it inspect an available connected source.

The operating update should include:

- stage change;
- probability change only when evidence changed;
- exact next action;
- exact next-action date;
- proposal / contract / invoice / cash state;
- result/evidence note.

### Midday — Close check

Ask:

> Re-rank Close Next from current evidence. What can still move today, and which task should I drop if something more valuable has appeared?

### 17:30 — Revenue close

Ask:

> Close today’s Revenue Mission. Reconcile completed actions and evidence, identify stale accounts, move weak pursuits to Parked where justified, and prepare tomorrow’s top three.

## Commercial discipline

1. **Cash beats pipeline.** Tender value does not count toward the USD 10K cash target until there is a credible award and payment path.
2. **One account, one next action.** No live pursuit should have an undefined next move.
3. **Qualified conversation → proposal within one business day.**
4. **Mobilization early.** For short fixed-price work, seek 50–70% mobilization where commercially and contractually appropriate.
5. **Evidence changes probability.** Do not raise probability because a deal feels promising.
6. **Stale pursuits are parked.** Pipeline size is not a success metric if accounts do not move.
7. **Three-item WIP limit.** Finish, delegate or park before starting another major action.
8. **Conflict guardrail.** GOPA/GIZ-related commercial work proceeds only through formal procurement or clearly non-conflicted scopes where Jacob has no award influence.

## Authority boundary

Jake/ChatGPT may autonomously perform reversible internal work such as:

- research;
- eligibility and fit analysis;
- drafting;
- updating internal account state;
- creating internal actions;
- preparing proposal components;
- reconciling JakeOS records;
- recording evidence supplied by Jacob.

Explicit approval remains required for:

- sending external messages;
- submitting applications, bids or proposals;
- publishing;
- signing contracts or NDAs;
- committing personnel or pricing where not already approved;
- approving or moving money.

## Definition of done for a commercial action

A revenue action is complete only when its observable result is recorded. Depending on the action, evidence may be:

- sent-message evidence;
- meeting note and buyer commitment;
- proposal/submission artifact;
- submission receipt;
- signed agreement;
- invoice;
- payment receipt;
- client acceptance;
- explicit no-bid / parked decision and rationale.

“Worked on it” is not Done.
