# Team Contract — ft_transcendence Chess App

> This contract is binding for all team members from day one.
> Every member must read it in full, understand it, and sign off on it
> before writing a single line of code.
> Ignorance of a rule in this document is not an excuse for violating it.

---

## Table of contents

1. [Team roles and responsibilities](#1-team-roles-and-responsibilities)
2. [Repository structure](#2-repository-structure)
3. [Branch hierarchy and naming](#3-branch-hierarchy-and-naming)
4. [The fork workflow — dev freedom and leader visibility](#4-the-fork-workflow--dev-freedom-and-leader-visibility)
5. [Integration branches](#5-integration-branches)
6. [The main-leader branch](#6-the-main-leader-branch)
7. [File ownership and the zero-conflict model](#7-file-ownership-and-the-zero-conflict-model)
8. [Interface contracts](#8-interface-contracts)
9. [Minimum bar before merging](#9-minimum-bar-before-merging)
10. [The merge approval process](#10-the-merge-approval-process)
11. [Bug ownership and arbitration](#11-bug-ownership-and-arbitration)
12. [Post-pull bug reporting](#12-post-pull-bug-reporting)
13. [Commit rules](#13-commit-rules)
14. [Force-push and amend rules](#14-force-push-and-amend-rules)
15. [Sync rules](#15-sync-rules)
16. [Language rules](#16-language-rules)
17. [PR description requirements](#17-pr-description-requirements)
18. [Platform enforcement summary](#18-platform-enforcement-summary)
19. [Contract breach](#19-contract-breach)
20. [Annexes](#20-annexes)
21. [Signatures](#21-signatures)

---

## 1. Team roles and responsibilities

The following roles are required by the ft_transcendence subject and must be
documented in both this contract and the project README.md.

| Person | Name | Role(s) | Domain |
|---|---|---|---|
| P1 | _(name)_ | Product Owner + Developer | React frontend |
| P2 | _(name)_ | Project Manager + Developer | Django backend, WebSockets |
| P3 | _(name)_ | Tech Lead + Developer | C++ chess engine, AI |
| P4 | _(name)_ | Developer + DevOps | PostgreSQL, Docker, Nginx |

### Role definitions

**Product Owner (P1)**
Defines the product vision, maintains the backlog, makes feature priority decisions,
validates completed work, and communicates with evaluators. Owns the product — not the
code.

**Project Manager / Scrum Master (P2)**
Organizes team meetings, tracks progress and deadlines, ensures communication flows,
manages risks and blockers. Monitors all branches in the central repo for progress.

**Tech Lead / Architect (P3)**
Defines and enforces the technical architecture. Makes technology stack decisions.
Reviews critical code changes. Owns the arbitration process for disputed bugs.
Reviews and approves all interface contracts before development begins.

**Developers (all)**
Write code for assigned features only. Participate in code reviews. Test their own
implementations. Write tests in English. Document their work.

---

## 2. Repository structure

### The two-repo model

Every developer maintains two separate spaces:

```
Central repo (github.com/team/chess-app)   ← owned by project leader
│  main                                    ← final stable, project leader only
│  main-dev                                ← clean working project, everyone pulls from here
│  main-leader                             ← project leader assembly and review layer
│  integration/frontend-backend            ← P1 + P2 boundary
│  integration/backend-engine              ← P2 + P3 boundary
│  integration/backend-database            ← P2 + P4 boundary
│  p1-frontend-auth                        ← P1's official feature branches
│  p1-frontend-board
│  p2-backend-websocket                    ← P2's official feature branches
│  p2-backend-api
│  p3-engine-validation                    ← P3's official feature branches
│  p3-engine-ai
│  p4-devops-docker                        ← P4's official feature branches
│  p4-devops-schema

Personal fork (github.com/alex/chess-app)  ← owned by the dev
│  (unlimited branches, total freedom)
│  experiment-1
│  wip-refactor
│  scratch-websocket
│  ...
```

### Rules

- The central repo is the source of truth. What is in the central repo is real.
  What is in a personal fork is private work in progress.
- A dev's fork is their private workshop. No rules govern what happens inside
  a fork. Devs may create, delete, force-push, amend, and experiment freely there.
- Only official feature branches, integration branches, and the three protected
  branches exist in the central repo. No experimental, WIP, or scratch branches
  may be pushed to the central repo.

---

## 3. Branch hierarchy and naming

### The full flow

```
Personal fork (free)
        ↓  push official feature branch to central repo
name-role-feature  (central repo — dev's official branch)
        ↓  PR when all milestone criteria are met (section 9)
integration/boundary-name  (long-lived, boundary proving ground)
        ↓  PR when boundary is fully tested, stable, and approved by both devs + Tech Lead
main-leader  (project leader's assembly and review layer)
        ↓  PR after 3–5 day review window, once full system is verified
main-dev  (clean working project — the branch everyone pulls from)
        ↓  PR only at stable project milestones, project leader only
main  (final stable release)
```

### Branch naming convention

| Type | Pattern | Examples |
|---|---|---|
| Official feature branch | `name-role-feature` | `alex-backend-websocket`, `sara-frontend-board` |
| Integration branch | `integration/side1-side2` | `integration/frontend-backend` |
| Leader assembly branch | `main-leader` | fixed name |
| Development branch | `main-dev` | fixed name |
| Stable branch | `main` | fixed name |

### Rules

- Branch names are lowercase, hyphen-separated, no spaces, no special characters.
- A dev may have multiple official feature branches in the central repo —
  one per distinct feature they are building.
- No dev may create a branch in the central repo that does not follow the
  naming convention above.
- Branch names must reflect their actual content. Vague names like
  `alex-fixes` or `test-branch` are not permitted in the central repo.

---

## 4. The fork workflow — dev freedom and leader visibility

### How it works

Each dev forks the central repo into their own GitHub account. All private
experimentation, WIP work, and free-form development happens in the fork.

When a dev reaches a clean, working state on a feature, they push that feature
branch to the central repo. This official branch in the central repo is what
the project leader monitors for progress.

```bash
# Dev pushes their official branch to the central repo
git push origin alex-backend-websocket

# All experimental work stays in the fork — never pushed to central repo
```

### What the fork allows

Inside a personal fork, a dev may:
- Create unlimited branches
- Delete branches freely
- Force-push
- Amend commits
- Rewrite history
- Experiment and break things

None of this is visible in the central repo and none of it is governed by
this contract.

### What the official branch requires

The moment a branch is pushed to the central repo, all rules in this contract
apply without exception. There is no grace period.

---

## 5. Integration branches

### Purpose

An integration branch exists to test the connection between two devs' work
through their shared interface contract — before any of that work reaches
`main-leader`. It is the proving ground for a single boundary.

### Lifecycle

```
Created    → when two devs begin working on their shared boundary
Fed        → each dev merges their official feature branch into it
             as features are completed
Synced     → pulled from main-dev within 24h of every merge into main-dev
Tested     → both devs test the integrated result together
Approved   → both devs formally approve the PR on GitHub
Merged     → Tech Lead does final review and merges into main-leader
Deleted    → after a successful merge into main-leader with no outstanding issues
```

### Rules

- Integration branches are long-lived. They persist for as long as the boundary
  they represent is under active development.
- An integration branch must never go more than 24 hours out of sync with
  `main-dev` after a merge has occurred. See section 15.
- No dev may merge into an integration branch without first meeting all
  milestone criteria defined in section 9.
- Integration branches may not be deleted until their PR into `main-leader` has
  been approved by all three required approvers and successfully merged.
- If an integration branch is deleted before a successful merge, the project
  leader must be notified immediately and the branch must be recreated from
  the last known good state.

### Integration branch ownership

Each integration branch is jointly owned by the two devs whose code meets
at that boundary.

| Integration branch | Joint owners | Supervised by |
|---|---|---|
| `integration/frontend-backend` | P1 + P2 | Tech Lead (P3) |
| `integration/backend-engine` | P2 + P3 | Tech Lead (P3) |
| `integration/backend-database` | P2 + P4 | Tech Lead (P3) |

---

## 6. The main-leader branch

### Purpose

`main-leader` is the project leader's personal assembly and review layer.
It sits between the integration branches and `main-dev` and serves four
distinct purposes:

**Purpose 1 — Personal assembly workspace**
The project leader assembles all integration branches into one running system
privately, without risking pollution of `main-dev` during the process.

**Purpose 2 — Cross-boundary issue resolution**
Some bugs only appear when all boundaries are assembled simultaneously —
invisible at the individual integration branch level. `main-leader` is where
these system-level bugs are caught and resolved before they ever reach
`main-dev`.

**Purpose 3 — Gate protecting main-dev**
Nothing reaches `main-dev` without passing a full project-leader-level review.
`main-dev` is always clean, always trustworthy, always a safe branch for the
whole team to pull from.

**Purpose 4 — System-level bug detection**
When all three integrations run together under realistic conditions, race
conditions, cross-service timing issues, and emergent failures become visible
for the first time. The project leader catches these on `main-leader` before
they become everyone's problem.

### The 3–5 day review window

When an integration branch merges into `main-leader`, the project leader has
between **3 and 5 calendar days** to complete their assembly, testing, and
system-level review.

At the end of that window, exactly one of two outcomes must occur:

```
Integration branch merges into main-leader
        ↓
Project leader has 3–5 days to:
  — assemble all integration branches into one running system
  — run the full stack end to end
  — catch cross-boundary and system-level bugs
  — resolve or assign any issues found
        ↓
Outcome A: everything passes
  → project leader opens PR: main-leader → main-dev
  → this PR requires no additional approvals — project leader merges it
  → team is notified immediately

Outcome B: issues found
  → project leader documents all issues as GitHub Issues
  → each issue is assigned to the correct owner (see section 11)
  → the relevant integration branch is notified and work resumes
  → the 3–5 day window resets when fixes are merged back into main-leader
```

The 3–5 day window begins the moment the first integration branch merges into
`main-leader` in a given assembly cycle. If multiple integration branches
merge in quick succession, the window covers all of them as a single assembly.

### Rules

- `main-leader` is owned exclusively by the project leader. No dev may open
  a PR targeting `main-leader` directly — only integration branches may merge
  into it, and only after the three-approval process in section 10.
- The project leader may not exceed 5 calendar days without either merging
  into `main-dev` or sending documented issues back to the relevant
  integration branches. Exceeding this window without action or communication
  is itself a process failure and must be announced to the team.
- Devs do not sync from `main-leader`. They sync from `main-dev` only.
  `main-leader` is the leader's private workspace — its intermediate state
  is not a reliable source for other devs.
- The project leader must announce in the team communication channel whenever
  `main-leader` receives a merge and whenever `main-leader` merges into
  `main-dev`.

---

## 7. File ownership and the zero-conflict model

### Philosophy

This project is designed so that merge conflicts are structurally impossible,
not merely unlikely. This is achieved by assigning every file and every folder
in the central repo to exactly one owner. Only the owner may commit changes
to their files. Everyone else submits a request to the owner, who implements
the change.

A merge conflict can only occur when two people edit the same file at the same
time. If ownership is respected, this cannot happen.

### Ownership map

```
frontend/                    → P1 (frontend)
backend/chess_app/api/       → P2 (backend)
backend/chess_app/game/      → P2 (backend)
backend/chess_app/users/     → P2 (backend)
engine/                      → P3 (engine)
docker-compose.yml           → P4 (DevOps)
.env.example                 → P4 (DevOps)
.gitignore                   → P4 (DevOps)
nginx/                       → P4 (DevOps)
README.md                    → Project leader
docs/TEAM_CONTRACT.md        → Project leader
docs/INTERFACE_CONTRACTS.md  → Project leader
.github/CODEOWNERS           → Project leader
contracts/                   → Project leader
```

### Rules

- No dev may modify a file they do not own. No exceptions. Not even for
  "a quick fix."
- If a dev needs a change in a file they do not own, they open a request
  (GitHub Issue or team chat message) to the owner, describing what they need
  and why. The owner implements it.
- This rule applies to all branches in the central repo — personal feature
  branches, integration branches, main-leader, main-dev, and main.
- CODEOWNERS enforcement (see section 18) means GitHub will automatically
  block any PR that touches a file without the owner's approval.

---

## 8. Interface contracts

### What they are

An interface contract is a written, committed document that defines exactly
how two pieces of code communicate across a boundary. It is agreed before
either side writes a single line of implementation code. It is the single
source of truth for bug ownership.

### Where they live

```
contracts/
├── frontend-backend-rest.md      ← REST API contract (P1 + P2)
├── frontend-backend-websocket.md ← WebSocket protocol contract (P1 + P2)
├── backend-engine.md             ← Python ↔ C++ bridge contract (P2 + P3)
└── backend-database.md           ← Django models / schema contract (P2 + P4)
```

### Who writes them

Each contract is:
1. **Negotiated** jointly by the two devs whose code meets at that boundary.
   Both sides must agree on the content. Neither side may impose a contract
   that is impractical for the other side to implement.
2. **Written** by one assigned dev who is the file owner (enforced via
   CODEOWNERS). The file owner is the only person who may commit changes
   to that contract file.
3. **Approved** by the Tech Lead (P3) before development begins on either side.

### Rules

- No dev may begin implementing their side of a boundary until the contract
  for that boundary has been written, agreed, committed, and approved by
  the Tech Lead.
- A contract may only be changed by mutual agreement of both devs involved,
  followed by a new Tech Lead approval. Unilateral changes to a contract are
  a contract breach.
- Contract files are written in English only.
- Every contract must define: input format, output format, all possible
  response states, and error conditions.

---

## 9. Minimum bar before merging

Before a dev may open a PR from their official feature branch into an
integration branch, all of the following criteria must be met:

- [ ] **Compiles and runs** — the feature runs without build errors or crashes
- [ ] **No console errors or warnings** — browser console and server logs are clean
- [ ] **Manually tested** — the dev has personally tested the feature end to end
- [ ] **Runs in isolation** — the feature works correctly using mocks for parts
      it depends on that are not yet built
- [ ] **Contract compliant** — the feature's output has been verified to match
      the interface contract exactly — not approximately
- [ ] **Tests pass** — all written tests for this feature pass
- [ ] **English comments** — all code comments in the branch are in English
      (see section 16)

A dev must be able to demonstrate all of the above during a PR review.
A PR that cannot demonstrate all criteria will be rejected without review.

---

## 10. The merge approval process

### Personal feature branch → Integration branch

```
Dev confirms all milestone criteria are met (section 9)
        ↓
Dev opens PR: name-role-feature → integration/boundary
        ↓
The other dev on that boundary reviews and approves
        ↓
PR is merged
```

Two approvals required: the merging dev + the other boundary dev.

### Integration branch → main-leader

```
Both boundary devs test the integration branch together
        ↓
Both devs agree the boundary is stable and contract-compliant
        ↓
Dev opens PR: integration/boundary → main-leader
        ↓
GitHub automatically requests approval from both boundary devs (via CODEOWNERS)
        ↓
Dev 1 approves: "My side is working. I confirm contract compliance."
Dev 2 approves: "My side is working. I confirm contract compliance."
        ↓
Tech Lead does final review — architecture, code quality, contract adherence
        ↓
Tech Lead merges into main-leader
```

Three approvals required: both boundary devs + Tech Lead.
The merge button is disabled on GitHub until all three have approved.

### main-leader → main-dev

Project leader only. No additional approvals required. Happens after the
3–5 day review window is complete and the assembled system is verified.
The project leader announces this merge in the team communication channel
immediately after it occurs.

### main-dev → main

Project leader only. No PR required from other team members. Happens only at
stable project milestones agreed upon by the whole team. No dev may open a
PR targeting `main`.

---

## 11. Bug ownership and arbitration

### The contract is the judge

When a bug appears in an integration branch or on `main-leader`, the first
question is always: *does one side violate the interface contract?*

```
Bug found
        ↓
Does one side's output violate the contract?
        ↓
YES → that side owns the fix. No debate. The contract is proof.
        ↓
NO — both sides appear contract-compliant
        ↓
Is the contract ambiguous or incomplete?
        ↓
YES → both devs revise the contract together.
      Both update their implementations.
      Tech Lead approves the revised contract.
        ↓
NO — contract is clear, both sides believe they comply
        ↓
Tech Lead arbitrates:
reads contract, inspects both implementations, makes final call
        ↓
┌────────────────────────────────────────────────────┐
│ One side actually violated the contract            │
│ despite believing they didn't                      │ → that side fixes it
└────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────┐
│ The contract itself is the problem                 │ → both devs revise it
└────────────────────────────────────────────────────┘
```

### Cross-dev bug discovery

The discovering dev and the owning dev are frequently different people.
This is expected and handled as follows:

- A bug discovered by Dev A that belongs to Dev B's domain is Dev B's
  responsibility to fix.
- Dev A's responsibility ends at opening a complete, reproducible GitHub Issue.
- Dev A may not attempt to fix code outside their ownership boundary —
  even to help. Well-intentioned fixes outside a boundary boundary are a
  contract breach and break the zero-conflict model.
- The issue report must be detailed enough for Dev B to reproduce and fix
  the bug independently, without requiring a lengthy back-and-forth.

### Rules

- A dev may never be held responsible for a bug that originates on the other
  side of their boundary.
- A dev may never be held responsible for a bug caused by a gap or ambiguity
  in the contract — only for a violation of a clearly stated contract rule.
- The Tech Lead's arbitration decision is final. It may not be appealed.
- Once a bug owner is identified, they must acknowledge ownership within
  24 hours and provide a fix timeline.
- A bug that sits unowned because both devs are pointing at each other is
  escalated immediately to the Tech Lead, who arbitrates within 24 hours.

---

## 12. Post-pull bug reporting

### The rule

After `main-dev` receives a merge and a dev pulls from it, if that dev
discovers a bug traceable to that pull, they must open a GitHub Issue
**immediately upon discovery** — not at the next standup, not when they
have time.

### Issue format

Every post-pull bug report must contain:

```
Title:    [POST-PULL BUG] <short description>

Body:
  — What the bug is (clear description of the observed behaviour)
  — How to reproduce it (exact steps, minimum reproduction case)
  — Which pull introduced it (reference the merge commit hash)
  — Which domain it appears to belong to (if known)
  — Whether it is blocking the reporting dev's work (yes / no)
```

### The 48-hour response window

The project leader has **48 hours** from the moment a post-pull issue is
opened to take the required action, determined by severity:

#### Severity categories

**Critical — breaks main-dev for everyone**

A bug that makes the application crash, fail to start, or produces data
corruption that affects all devs pulling from `main-dev`.

```
Required action within 48 hours:
  — Full fix implemented, tested, and merged into main-dev
  — Or: the offending merge reverted and main-dev restored to a clean state
  — Team notified of the resolution in the communication channel
```

**Targeted — breaks a specific boundary, affects only the devs on that boundary**

A bug visible only to the dev whose domain consumes the affected boundary
output. Other devs are unaffected.

```
Required action within 48 hours:
  — Issue acknowledged by the project leader
  — Bug assigned to the correct owner (based on the contract)
  — Fix timeline defined and communicated to the affected dev(s)
  — Full resolution timeline determined case by case based on complexity
```

**Local — affects only the discovering dev's integration**

A bug that surfaces only in one dev's domain as a result of the pull, with
no impact on other team members.

```
Required action within 48 hours:
  — Issue acknowledged by the project leader
  — Bug assigned to the correct owner
  — Lower urgency unless the discovering dev is fully blocked
  — If the discovering dev is blocked: treated as Targeted severity
```

### Blast radius principle

Because of the zero-conflict, ownership-based architecture, a post-pull bug
almost never affects the entire team equally. Its blast radius maps directly
to the boundary it belongs to:

```
Bug in shared infrastructure (docker, nginx, db schema)
  → potentially affects everyone → Critical severity

Bug in a specific boundary output
  → affects only the consumer of that boundary → Targeted severity

Bug in one dev's domain triggered by a pull
  → affects only that dev → Local severity
```

### Rules

- The 48-hour clock starts the moment the GitHub Issue is opened, not when
  the project leader reads it.
- The project leader must acknowledge every post-pull issue within 48 hours,
  even if full resolution takes longer.
- A dev who discovers a bug and does not report it immediately, choosing
  instead to work around it silently, is in breach of this contract.
- A dev who attempts to fix a bug in another dev's domain without being
  assigned to it is in breach of this contract.

---

## 13. Commit rules

### Commit message format

Every commit pushed to the central repo must follow this format:

```
<short description of what was done> (50 chars max)

<optional longer explanation of what changed and why>
<what was tested>
<what this commit achieves toward the milestone>

Good Luck, <name> <unique-emoji>
```

**Example:**

```
Add WebSocket move handler for chess moves

Implemented the Django Channels consumer that receives move events
from React clients. Validates the format against the WebSocket
contract before passing to the game manager. Tested with two
simultaneous browser clients using mocked engine responses.
Covers: contracts/frontend-backend-websocket.md — move event handling.

Good Luck, alex 🦊
```

### Signature rule

- Every commit pushed to the central repo must end with
  `Good Luck, <name> <emoji>` on the last line.
- Each dev's emoji is unique and assigned on day one. No two devs share
  an emoji. The emoji map is recorded in this document and in the README.
- The signature serves as an audit trail. The project leader may run
  `git log --all --grep="alex"` or `git log --all --grep="🦊"` to instantly
  retrieve all commits from a specific dev.

### Dev emoji map

| Dev | Name | Emoji |
|---|---|---|
| P1 | _(name)_ | _(emoji)_ |
| P2 | _(name)_ | _(emoji)_ |
| P3 | _(name)_ | _(emoji)_ |
| P4 | _(name)_ | _(emoji)_ |

*(Fill in on day one. Each dev chooses their emoji. First come first served.)*

### Additional commit rules

- All commit messages must be in English.
- Commit messages must be descriptive. Single-word messages (`fix`, `update`,
  `wip`) are not permitted in the central repo.
- A commit must represent a single logical change. Do not bundle unrelated
  changes into one commit.
- Empty commits are not permitted.
- Merge commits generated by GitHub are exempt from the signature rule.

---

## 14. Force-push and amend rules

### Force-push

Force-push is **blocked at the GitHub platform level** on all branches in the
central repo — personal feature branches, integration branches, `main-leader`,
`main-dev`, and `main`.

The only exception is the project leader acting as repository administrator,
who retains force-push ability for emergency recovery only. This power may
not be delegated.

Inside a personal fork, force-push is unrestricted.

### Amend

`git commit --amend` is governed by a single, absolute rule:

> **Before push to any remote: amend freely.**
> **After push to any remote: never amend. Make a new commit.**

This rule applies everywhere — inside a fork, on a personal feature branch,
on an integration branch. The moment a commit exists on any remote, it is
permanent. History is append-only from that point forward.

**Why:** once a commit is pushed, other people or tools may have seen it.
Amending a pushed commit changes its hash and corrupts the history of anyone
who has already referenced that commit. The commit signature audit trail
depends on history being immutable after push.

**Enforcement:** since force-push is blocked on the central repo at the
platform level, a dev who amends a pushed commit on the central repo cannot
push the amended version — GitHub will reject the push. The rule is therefore
technically enforced on the central repo. Inside a fork, the rule is
contractual.

---

## 15. Sync rules

### The event-driven sync rule

Within **24 hours** of any merge into `main-dev`, every dev must:

1. Pull `main-dev` into their official feature branch(es) in the central repo
2. Pull `main-dev` into their relevant integration branch(es)

```bash
# Sync personal feature branch
git checkout alex-backend-websocket
git pull origin main-dev

# Sync integration branch
git checkout integration/backend-engine
git pull origin main-dev
```

### Important: devs sync from main-dev only

Devs never sync from `main-leader`. `main-leader` is the project leader's
private assembly workspace. Its intermediate state is unstable by design —
the leader may be in the middle of resolving cross-boundary issues. Pulling
from `main-leader` would expose devs to work-in-progress that has not been
verified for team-wide consumption.

`main-dev` is always the clean, verified, team-trusted branch. It is the
only branch devs pull from.

### Why this rule exists

Integration branches are long-lived. Without regular sync from `main-dev`,
they drift. The longer they drift, the larger the eventual merge conflict.
By syncing within 24 hours of every merge, the maximum drift is bounded to
one merge cycle — making the final integration into `main-leader` a small,
clean operation rather than a multi-day conflict resolution.

### Rules

- The 24-hour clock starts the moment the merge into `main-dev` is completed,
  not when the dev notices it.
- The project leader will notify the team in the communication channel
  immediately after every merge into `main-dev`.
- Failure to sync within 24 hours is a contract breach.
- A dev who is blocked from syncing due to a conflict must notify the project
  leader immediately — not after 24 hours.

---

## 16. Language rules

### Personal fork

| Element | Rule |
|---|---|
| Code comments | Any language |
| Commit messages | **English only** |
| Tests | **English only** |
| Branch names | **English only** |

### Official feature branches (central repo)

| Element | Rule |
|---|---|
| Code comments | **English only** |
| Commit messages | **English only** |
| Tests and test descriptions | **English only** |
| Variable and function names | **English only** |

### Integration branches — on first merge from personal branch

Personal-language comments that arrived from a personal branch may be present
temporarily. They must be cleaned before the branch is considered merge-ready.

### Integration branches — before opening a PR into main-leader

Before a PR into `main-leader` may be opened, the following cleanup must be
complete:

- All code comments have been reviewed
- Non-English comments have been removed or rewritten in English
- Only minimal, necessary comments remain
- All remaining comments are in English
- This cleanup is verified by both boundary devs as part of their sign-off

### main-leader, main-dev, and main

Everything in English without exception:

- Code and comments
- Commit messages
- PR titles and descriptions
- PR review comments
- Test names and test descriptions
- Documentation strings
- GitHub Issue titles and bodies

### General rules

- "English only" means written in English. It does not prohibit technical
  terms, library names, or identifiers that are inherently language-neutral.
- A comment that explains *why* something was done is valuable and encouraged.
  A comment that restates *what* the code does is noise and should be omitted.
- When in doubt about whether a comment is necessary: omit it.

---

## 17. PR description requirements

Every PR opened at any level must include a description that answers these
three questions:

**1. What was implemented?**
A clear, specific description of what this PR adds or changes. Not vague.
Not "various fixes." The reader must understand exactly what changed without
reading the code.

**2. How was it tested?**
What was done to verify this works. Manual tests, automated tests, mock
scenarios, edge cases considered. Be specific.

**3. Which part of the interface contract does this satisfy?**
Reference the specific contract file and section. Example:
*"This PR satisfies the move validation section of
`contracts/backend-engine.md` — specifically the validate_and_apply
function contract."*

A PR that does not answer all three questions will be rejected without review.

---

## 18. Platform enforcement summary

The following rules are enforced at the GitHub platform level and cannot be
bypassed by any dev (project leader excluded as repository admin):

| Rule | Enforcement mechanism |
|---|---|
| No force-push on any central repo branch | Branch protection: "Block force pushes" on all branches |
| main, main-dev, main-leader require PR to merge | Branch protection: "Require pull request" |
| main-leader requires 3 approvals (both devs + Tech Lead) | Branch protection: "Required reviewers" |
| main-dev requires project leader approval only | Branch protection: "Required reviewers" |
| main requires project leader only | Branch protection: "Restrict who can push" |
| File ownership respected | `.github/CODEOWNERS` — PR blocked if file owner has not approved |
| Signed commits (optional) | Branch protection: "Require signed commits" (if team sets up GPG) |

The project leader must configure all of the above on GitHub before any dev
pushes their first commit to the central repo.

---

## 19. Contract breach

### What constitutes a breach

Any violation of a rule marked as absolute in this contract. Examples:

- Pushing to a file you do not own
- Force-pushing to the central repo
- Amending a commit after it has been pushed to any remote
- Opening a PR without meeting all milestone criteria
- Failing to sync within 24 hours of a merge into main-dev
- Committing in a language other than English to a branch where English is required
- Modifying an interface contract without mutual agreement and Tech Lead approval
- Opening a PR without a complete description
- Attempting to fix a bug in another dev's domain without being assigned to it
- Failing to report a discovered bug immediately
- Syncing from main-leader instead of main-dev

### How breaches are handled

A first breach results in a documented warning from the project leader.
The breaching dev must:
1. Acknowledge the breach
2. Correct it (revert, fix, or otherwise undo the violation)
3. Explain in the team channel what happened and how they will avoid it

A second breach by the same dev is escalated to the team for discussion.
The project leader has final authority on consequences.

No breach is punished retroactively if the dev identifies and reports it
themselves before it is discovered by someone else. Self-reporting is always
treated more leniently than discovered violations.

---

## 20. Annexes

The following documents are part of this contract by reference.
They must be read before development begins.

| Document | Location | Owner |
|---|---|---|
| Interface contracts | `contracts/` | Project leader + assigned devs |
| npm secure usage guide | `docs/npm-secure-usage-guide.md` | Project leader |
| Project setup instructions | `README.md` | Project leader |

The interface contracts annex (`docs/INTERFACE_CONTRACTS.md`) will be written
in week one of the project during a team session organized by the Tech Lead.
No implementation work may begin before this session is complete.

---

## 21. Signatures

By signing below, each team member confirms they have read this contract in
full, understand every rule, and commit to following it for the duration of
the project.

| Name | Role | Signature | Date |
|---|---|---|---|
| _(name)_ | Product Owner / P1 | | |
| _(name)_ | Project Manager / P2 | | |
| _(name)_ | Tech Lead / P3 | | |
| _(name)_ | DevOps / P4 | | |

---

*This contract was established before development began and reflects decisions
made collectively by the team. Any amendment requires a unanimous team vote
and project leader approval. Amendments are appended to this document with
a date and the names of all approvers.*

