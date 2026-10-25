import { describe, expect, it } from "vitest";
import type { ChannelAdapter } from "@/lib/channels/channel-adapter";
import { createMockChannel } from "@/lib/channels/mock-channel";
import { executeApproval } from "@/lib/workflows/execution-service";
import { addTestMember, createTestApproval, createTestBrand, createTestUser, createTestWorkspace } from "@/test/fixtures";
import { listActivity } from "./activity-log";
import { approve, getApproval, listPendingApprovals, reject, type StartExecution } from "./approvals";
import { editProposedContent, getContentAsset } from "./content-assets";

const POST_TEXT = "Our autumn blend lands Monday: cocoa, cherry and a long, warm finish.";
const EDITED_TEXT = "Our autumn blend lands Tuesday: cocoa, cherry and a long, warm finish.";

// Written out by hand: what submitting POST_TEXT on the mock Channel proposes.
const FIRST_PAYLOAD = {
  channel: "MOCK",
  contentType: "SOCIAL_POST",
  content: { body: POST_TEXT },
  audience: null,
  timing: { kind: "AS_SOON_AS_APPROVED" },
};
// SHA-256 of FIRST_PAYLOAD's canonical serialization (the same payload as in approvals.test.ts).
const FIRST_HASH = "b3ce605b898eaf2c63167bdf99b30c20e8d433dd8372672159131842290bd87d";

// approve's background start; these tests run the Execution themselves.
const startNothing: StartExecution = async () => {};

// Olivia owns the Workspace and Mia is a Member. The Brand prohibits "free". Mia has
// submitted POST_TEXT.
async function setUpSubmitted() {
  const owner = await createTestUser("Olivia");
  const workspaceId = await createTestWorkspace(owner, "acme-agency");
  const mia = await createTestUser("Mia");
  await addTestMember(workspaceId, mia, "MEMBER");
  const brandId = await createTestBrand(owner, workspaceId, { name: "Northwind Coffee", prohibitedPhrases: ["free"] });
  const approvalId = await createTestApproval(mia, workspaceId, brandId, POST_TEXT);
  const approval = await getApproval(mia, workspaceId, approvalId);
  if (!approval.ok) throw new Error("Test setup: expected the Approval.");
  return { owner, mia, workspaceId, brandId, approvalId, contentAssetId: approval.value.contentAsset.id };
}

// As setUpSubmitted, and Olivia has approved it; nothing has executed yet.
async function setUpApproved() {
  const setup = await setUpSubmitted();
  const approved = await approve(setup.owner, setup.workspaceId, setup.approvalId, startNothing);
  if (!approved.ok) throw new Error("Test setup: could not approve.");
  return setup;
}

describe("editing after submission", () => {
  it("supersedes a Pending Approval with a new Pending one for the edited text, and logs both", async () => {
    const { owner, mia, workspaceId, brandId, approvalId } = await setUpSubmitted();

    const result = await editProposedContent(mia, workspaceId, approvalId, { body: EDITED_TEXT });

    if (!result.ok) throw new Error("expected the edit to succeed");
    const newId = result.value.id;
    expect(newId).not.toBe(approvalId);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "SUPERSEDED", supersededById: newId },
    });
    expect(await getApproval(mia, workspaceId, newId)).toMatchObject({
      ok: true,
      value: {
        status: "PENDING",
        supersedesId: approvalId,
        proposedAction: { payload: { ...FIRST_PAYLOAD, content: { body: EDITED_TEXT } }, createdBy: "Mia" },
        contentAsset: { body: EDITED_TEXT },
      },
    });
    expect(await listPendingApprovals(owner, workspaceId)).toMatchObject({ ok: true, value: [{ id: newId }] });
    expect(await listActivity(owner, workspaceId)).toMatchObject({
      ok: true,
      value: [
        { event: "APPROVAL_SUPERSEDED", actorName: "Mia", brand: { id: brandId }, approvalId, details: { payloadHash: FIRST_HASH, supersededById: newId } },
        { event: "PROPOSED_ACTION_SUBMITTED", actorName: "Mia", approvalId: newId },
        { event: "PROPOSED_ACTION_SUBMITTED", approvalId },
        { event: "BRAND_CREATED" },
      ],
    });
  });

  it("leaves the old Proposed Action exactly as it was proposed", async () => {
    const { mia, workspaceId, approvalId } = await setUpSubmitted();

    await editProposedContent(mia, workspaceId, approvalId, { body: EDITED_TEXT, audience: "Newsletter subscribers" });

    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { proposedAction: { payload: FIRST_PAYLOAD, payloadHash: FIRST_HASH, createdBy: "Mia" } },
    });
  });

  it("supersedes an Approved Approval that hasn't executed, and its queued Execution then sends nothing", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const result = await editProposedContent(mia, workspaceId, approvalId, { body: EDITED_TEXT });
    const channel = createMockChannel();

    const outcome = await executeApproval(approvalId, { MOCK: channel });

    if (!result.ok) throw new Error("expected the edit to succeed");
    expect(outcome).toEqual({ status: "REFUSED", reason: "NOT_APPROVED" });
    expect(channel.deliveries).toEqual([]);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "SUPERSEDED", decidedBy: "Olivia", executions: [] },
    });
    // The edit needs a fresh decision.
    expect(await getApproval(mia, workspaceId, result.value.id)).toMatchObject({ ok: true, value: { status: "PENDING" } });
  });

  it("supersedes when only the recipients change", async () => {
    const { mia, workspaceId, approvalId } = await setUpSubmitted();

    const result = await editProposedContent(mia, workspaceId, approvalId, { body: POST_TEXT, audience: "Wholesale buyers" });

    if (!result.ok) throw new Error("expected the edit to succeed");
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "SUPERSEDED" } });
    expect(await getApproval(mia, workspaceId, result.value.id)).toMatchObject({
      ok: true,
      value: { status: "PENDING", proposedAction: { payload: { ...FIRST_PAYLOAD, audience: "Wholesale buyers" } } },
    });
  });

  it("checks the edited text against the Brand rules again", async () => {
    const { mia, workspaceId, approvalId } = await setUpSubmitted();

    const result = await editProposedContent(mia, workspaceId, approvalId, { body: `${POST_TEXT} Free shipping.` });

    if (!result.ok) throw new Error("expected the edit to succeed");
    expect(await getApproval(mia, workspaceId, result.value.id)).toMatchObject({
      ok: true,
      value: { contentAsset: { violations: [{ kind: "PROHIBITED_PHRASE", phrase: "free" }] } },
    });
  });

  it("is refused when nothing changed, and supersedes nothing", async () => {
    const { mia, workspaceId, approvalId, contentAssetId } = await setUpSubmitted();

    const result = await editProposedContent(mia, workspaceId, approvalId, { body: ` ${POST_TEXT} `, audience: " " });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "PENDING" } });
    expect(await getContentAsset(mia, workspaceId, contentAssetId)).toMatchObject({ ok: true, value: { proposals: [{}] } });
  });

  it("is refused for an empty body", async () => {
    const { mia, workspaceId, approvalId } = await setUpSubmitted();

    const result = await editProposedContent(mia, workspaceId, approvalId, { body: " " });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", fieldErrors: { body: [expect.any(String)] } } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "PENDING" } });
  });

  it("does not supersede an Approval whose Execution succeeded, and changes nothing", async () => {
    const { mia, workspaceId, approvalId, contentAssetId } = await setUpApproved();
    await executeApproval(approvalId, { MOCK: createMockChannel() });

    const result = await editProposedContent(mia, workspaceId, approvalId, { body: EDITED_TEXT });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({
      ok: true,
      value: { status: "APPROVED", supersededById: null, contentAsset: { body: POST_TEXT } },
    });
    expect(await getContentAsset(mia, workspaceId, contentAssetId)).toMatchObject({ ok: true, value: { proposals: [{}] } });
  });

  it("does not supersede an Approval while its Execution is delivering it", async () => {
    const { mia, workspaceId, approvalId } = await setUpApproved();
    const edits: unknown[] = [];
    const channel = createMockChannel();
    const editingChannel: ChannelAdapter = {
      deliver: async (delivery) => {
        edits.push(await editProposedContent(mia, workspaceId, approvalId, { body: EDITED_TEXT }));
        return channel.deliver(delivery);
      },
    };

    await executeApproval(approvalId, { MOCK: editingChannel });

    expect(edits).toMatchObject([{ ok: false, error: { code: "CONFLICT" } }]);
    expect(channel.deliveries).toMatchObject([{ payload: FIRST_PAYLOAD }]);
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "APPROVED" } });
  });

  it("is refused for a Rejected Approval, which is resubmitted instead", async () => {
    const { owner, mia, workspaceId, approvalId } = await setUpSubmitted();
    await reject(owner, workspaceId, approvalId, { comment: "Say Tuesday." });

    const result = await editProposedContent(mia, workspaceId, approvalId, { body: EDITED_TEXT });

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "REJECTED" } });
  });

  it("is refused for a version that was already superseded", async () => {
    const { mia, workspaceId, approvalId, contentAssetId } = await setUpSubmitted();
    await editProposedContent(mia, workspaceId, approvalId, { body: EDITED_TEXT });

    const stale = await editProposedContent(mia, workspaceId, approvalId, { body: "Another edit." });

    expect(stale).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await getContentAsset(mia, workspaceId, contentAssetId)).toMatchObject({
      ok: true,
      value: { body: EDITED_TEXT, proposals: [{}, {}] },
    });
  });

  it("supersedes once when two people edit the same version at the same moment", async () => {
    const { owner, mia, workspaceId, approvalId, contentAssetId } = await setUpSubmitted();

    const outcomes = await Promise.all([
      editProposedContent(mia, workspaceId, approvalId, { body: EDITED_TEXT }),
      editProposedContent(owner, workspaceId, approvalId, { body: "Another edit." }),
    ]);

    expect(outcomes.filter(({ ok }) => ok)).toHaveLength(1);
    expect(outcomes.filter(({ ok }) => !ok)).toMatchObject([{ error: { code: "CONFLICT" } }]);
    expect(await getContentAsset(mia, workspaceId, contentAssetId)).toMatchObject({ ok: true, value: { proposals: [{}, {}] } });
  });

  it("is not found for another Workspace's Approval, and changes nothing", async () => {
    const { mia, workspaceId, approvalId } = await setUpSubmitted();
    const outsider = await createTestUser("Oscar");
    const outsiderWorkspaceId = await createTestWorkspace(outsider, "other-agency");

    const asOutsider = await editProposedContent(outsider, workspaceId, approvalId, { body: EDITED_TEXT });
    const fromOwnWorkspace = await editProposedContent(outsider, outsiderWorkspaceId, approvalId, { body: EDITED_TEXT });

    expect(asOutsider).toMatchObject({ ok: false });
    expect(fromOwnWorkspace).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getApproval(mia, workspaceId, approvalId)).toMatchObject({ ok: true, value: { status: "PENDING" } });
  });
});

describe("a Content Asset's history", () => {
  it("keeps every Proposed Action, newest first, with its Approval's state", async () => {
    const { owner, mia, workspaceId, approvalId, contentAssetId } = await setUpApproved();
    const second = await editProposedContent(mia, workspaceId, approvalId, { body: EDITED_TEXT });
    if (!second.ok) throw new Error("expected the edit to succeed");
    const third = await editProposedContent(owner, workspaceId, second.value.id, { body: EDITED_TEXT, audience: "Wholesale buyers" });
    if (!third.ok) throw new Error("expected the edit to succeed");

    const history = await getContentAsset(mia, workspaceId, contentAssetId);

    expect(history).toMatchObject({
      ok: true,
      value: {
        variant: 1,
        body: EDITED_TEXT,
        task: { brand: { name: "Northwind Coffee" } },
        proposals: [
          {
            createdBy: "Olivia",
            payload: { content: { body: EDITED_TEXT }, audience: "Wholesale buyers" },
            approval: { id: third.value.id, status: "PENDING", supersededById: null, isEditable: true },
          },
          {
            createdBy: "Mia",
            payload: { content: { body: EDITED_TEXT }, audience: null },
            approval: { id: second.value.id, status: "SUPERSEDED", supersededById: third.value.id, isEditable: false },
          },
          {
            createdBy: "Mia",
            payload: FIRST_PAYLOAD,
            payloadHash: FIRST_HASH,
            approval: { id: approvalId, status: "SUPERSEDED", supersededById: second.value.id, isEditable: false },
          },
        ],
      },
    });
  });

  it("is not found from another Workspace", async () => {
    const { contentAssetId } = await setUpSubmitted();
    const outsider = await createTestUser("Oscar");
    const outsiderWorkspaceId = await createTestWorkspace(outsider, "other-agency");

    expect(await getContentAsset(outsider, outsiderWorkspaceId, contentAssetId)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
