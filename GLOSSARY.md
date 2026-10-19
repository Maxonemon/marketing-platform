# Marketing Platform

An internal tool where AI agents draft marketing content and research competitors for a business or agency, and a human approves every action before anything is published or sent.

## Language

### Tenancy

**Workspace**:
The business or agency using the platform; everything else belongs to exactly one Workspace.
_Avoid_: Tenant, organization, account

**Brand**:
A brand the Workspace markets; for an agency, each client is a Brand.
_Avoid_: Client, customer, account

**Owner / Admin / Member**:
The roles a person can hold in a Workspace.

**Approver**:
An Owner or Admin deciding on a Proposed Action; Members may draft and edit but not approve. Approving your own request is allowed.
_Avoid_: Reviewer (when the person decides rather than just picks)

### Content and approval

**Content Asset**:
An editable draft piece of marketing content, such as a post, ad copy, email, landing page or lead magnet. It is never approved directly.
_Avoid_: Draft, post (as a generic term)

**Variant**:
One of several alternative Content Assets produced by the same Task for the same purpose.

**Campaign**:
A bundle of Content Assets meant to go live together, such as a landing page, form and email sequence.

**Review**:
A finished content Task waiting for a person to pick, and optionally edit, one Variant.

**Proposed Action**:
An immutable snapshot of exactly what would be published or sent: the content, the Channel, the audience or recipients, and when. A Campaign is one Proposed Action.
_Avoid_: Payload, action request

**Approval**:
A human decision on one Proposed Action: Pending, Approved, Rejected, Expired or Superseded. It says nothing about whether the action has run.
_Avoid_: Sign-off

**Superseded**:
The state of an Approval whose Proposed Action was replaced by a newer one after a material change to content, audience, recipients, Channel or timing.

**Expired**:
The state of a Pending Approval that nobody decided within 7 days. It is final.

**Execution**:
One attempt to carry out an Approved Proposed Action, with its result. One Approval may have several attempts but at most one success.
_Avoid_: Publish, send (as nouns for the attempt)

### Work

**Task**:
One run of one agent, with its input and result.
_Avoid_: Job, agent task

**Workflow**:
A named sequence of Tasks started by a Trigger.

**Trigger**:
What starts a Workflow: a person, a Schedule or an event such as a Finding.

**Schedule**:
A recurring Trigger.
_Avoid_: Cron

### Research

**Competitor**:
A rival business that the platform watches on behalf of a Brand.

**Monitored Page**:
One public web page of a Competitor that is checked periodically.
_Avoid_: Competitor URL

**Snapshot**:
The record of one check of a Monitored Page.

**Change**:
A difference in meaningful facts, such as a price, offer or headline, between two Snapshots of a page. Cosmetic differences are not Changes.
_Avoid_: Diff

**Finding**:
The assessed business impact of one or more Changes, with evidence links and a recommendation.
_Avoid_: Insight

### Delivery and audit

**Channel**:
Where a Proposed Action lands, such as a LinkedIn post, an email list or a Meta ad.
_Avoid_: Platform

**Integration**:
A Workspace's configured, credentialed connection to an outside service. A Channel is served by an Integration, but not every Integration is a Channel (Slack only notifies).
_Avoid_: Platform, connector

**Activity Log**:
The permanent, append-only record of who did what and when: decisions, Executions and errors.
_Avoid_: Audit log, history
