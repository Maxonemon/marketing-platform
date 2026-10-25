import { describe, expect, it } from "vitest";
import { createFakeAiProvider } from "@/lib/ai/fake-provider";
import { AI_OUTPUT_INVALID, AiProviderError } from "@/lib/ai/provider";
import { CONTENT_BRIEF_MAX_LENGTH } from "@/lib/limits";
import { addTestMember, createTestBrand, createTestUser, createTestWorkspace } from "@/test/fixtures";
import { listActivity } from "./activity-log";
import {
  requestContent,
  runContentTask,
  TASK_FAILED_UNEXPECTEDLY,
  TASK_START_FAILED,
  type StartTask,
} from "./content-requests";
import { getReview } from "./reviews";
import { getTask, listTasks } from "./tasks";

const NORTHWIND = {
  name: "Northwind Coffee",
  audience: "Remote workers who buy beans online",
  voice: "Warm and plain-spoken. No jargon.",
};

const LAUNCH_POST = { contentType: "SOCIAL_POST", channel: "MOCK", brief: "Announce our autumn blend, out on Monday." } as const;

const POST_TEXT = "Our autumn blend lands Monday: cocoa, cherry and a long, warm finish.";
const POSTS = {
  variants: [
    { body: POST_TEXT },
    { body: "Monday brings our autumn blend. Cocoa up front, cherry behind." },
    { body: "New beans on Monday: the autumn blend is nearly here." },
  ],
};

const WELCOME_EMAIL = { contentType: "EMAIL", channel: "MOCK", brief: "Welcome new subscribers." } as const;
const EMAILS = {
  variants: [
    { subject: "Welcome to Northwind", body: "Thanks for joining us. Your first bag ships Friday." },
    { subject: "You're in", body: "Good coffee is on its way. Here is what to expect." },
    { subject: "Hello from Northwind Coffee", body: "We roast every Tuesday and ship every Friday." },
  ],
};

// Stands in for Inngest: records which Tasks the request asked to start.
function recordingStartTask(): { startTask: StartTask; startedTaskIds: string[] } {
  const startedTaskIds: string[] = [];
  return {
    startedTaskIds,
    startTask: async (taskId) => {
      startedTaskIds.push(taskId);
    },
  };
}

async function setUpBrand() {
  const owner = await createTestUser("Olivia");
  const workspaceId = await createTestWorkspace(owner, "acme-agency");
  const mia = await createTestUser("Mia");
  await addTestMember(workspaceId, mia, "MEMBER");
  const brandId = await createTestBrand(owner, workspaceId, NORTHWIND);
  return { owner, mia, workspaceId, brandId };
}

describe("requesting content", () => {
  it("queues a Task at once, and the background run writes three Variants for Review", async () => {
    const { owner, mia, workspaceId, brandId } = await setUpBrand();
    const { startTask, startedTaskIds } = recordingStartTask();
    const ai = createFakeAiProvider(() => POSTS);

    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);

    if (!requested.ok) throw new Error("expected the request to succeed");
    const taskId = requested.value.id;
    expect(requested.value.status).toBe("QUEUED");
    expect(startedTaskIds).toEqual([taskId]);
    expect(ai.requests).toEqual([]);
    expect(await getTask(owner, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "QUEUED" } });

    await runContentTask(taskId, ai);

    expect(await getTask(owner, workspaceId, taskId)).toMatchObject({
      ok: true,
      value: {
        type: "CONTENT_GENERATION",
        status: "IN_REVIEW",
        brand: { id: brandId, name: "Northwind Coffee" },
        requestedBy: "Mia",
        input: LAUNCH_POST,
        error: null,
        startedAt: expect.any(Date),
        finishedAt: expect.any(Date),
      },
    });
    expect(await getReview(mia, workspaceId, taskId)).toMatchObject({
      ok: true,
      value: {
        task: { id: taskId },
        variants: POSTS.variants.map(({ body }, index) => ({ variant: index + 1, subject: null, body })),
      },
    });
    expect(await listTasks(owner, workspaceId)).toMatchObject({ ok: true, value: [{ id: taskId, status: "IN_REVIEW" }] });
  });

  it("gives the content agent the Brand's settings, the brief and a max token limit", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const ai = createFakeAiProvider(() => POSTS);

    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");
    await runContentTask(requested.value.id, ai);

    expect(ai.requests).toHaveLength(1);
    const [request] = ai.requests;
    if (!request) throw new Error("expected one AI request");
    expect(request.prompt).toContain("Northwind Coffee");
    expect(request.prompt).toContain(NORTHWIND.audience);
    expect(request.prompt).toContain(NORTHWIND.voice);
    expect(request.prompt).toContain(LAUNCH_POST.brief);
    expect(request.maxTokens).toBeGreaterThan(0);
  });

  it("writes a subject line for each Variant of an Email", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const ai = createFakeAiProvider(() => EMAILS);

    const requested = await requestContent(mia, workspaceId, brandId, WELCOME_EMAIL, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");
    await runContentTask(requested.value.id, ai);

    expect(ai.requests[0]?.prompt).toContain("subject");
    expect(await getReview(mia, workspaceId, requested.value.id)).toMatchObject({
      ok: true,
      value: { variants: EMAILS.variants.map((variant, index) => ({ variant: index + 1, ...variant })) },
    });
  });

  // Inngest may deliver an event twice.
  it("runs each Task once: a second run of the same Task does nothing", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const ai = createFakeAiProvider(() => POSTS);
    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");

    await runContentTask(requested.value.id, ai);
    await runContentTask(requested.value.id, ai);

    expect(ai.requests).toHaveLength(1);
    expect(await getTask(mia, workspaceId, requested.value.id)).toMatchObject({
      ok: true,
      value: { status: "IN_REVIEW", variantCount: 3 },
    });
  });

  it("refuses an invalid request with a message for each field, and queues nothing", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask, startedTaskIds } = recordingStartTask();

    const result = await requestContent(
      mia,
      workspaceId,
      brandId,
      { contentType: "PODCAST", channel: "LINKEDIN", brief: "x".repeat(CONTENT_BRIEF_MAX_LENGTH + 1) },
      startTask,
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        fieldErrors: { contentType: [expect.any(String)], channel: [expect.any(String)], brief: [expect.any(String)] },
      },
    });
    expect(startedTaskIds).toEqual([]);
    expect(await listTasks(mia, workspaceId)).toEqual({ ok: true, value: [] });
  });
});

describe("retrying after an AI error", () => {
  const OVERLOADED = "The AI service is busy. Try again in a moment.";

  it("hands the Task back on a transient error, and the retry completes it", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    let calls = 0;
    const ai = createFakeAiProvider(() => {
      calls += 1;
      if (calls === 1) throw new AiProviderError(OVERLOADED, { transient: true });
      return POSTS;
    });
    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");
    const taskId = requested.value.id;

    expect(await runContentTask(taskId, ai, { isFinalAttempt: false })).toBe("RETRY");
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({ ok: true, value: { status: "QUEUED", error: null } });

    expect(await runContentTask(taskId, ai, { isFinalAttempt: false })).toBe("DONE");
    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({
      ok: true,
      value: { status: "IN_REVIEW", error: null, variantCount: 3 },
    });
    expect(await listActivity(mia, workspaceId)).toMatchObject({ ok: true, value: [{ event: "BRAND_CREATED" }] });
  });

  it("fails the Task when the last attempt hits a transient error", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const ai = createFakeAiProvider(() => {
      throw new AiProviderError(OVERLOADED, { transient: true });
    });
    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");

    expect(await runContentTask(requested.value.id, ai, { isFinalAttempt: true })).toBe("DONE");

    expect(await getTask(mia, workspaceId, requested.value.id)).toMatchObject({
      ok: true,
      value: { status: "FAILED", error: OVERLOADED },
    });
  });

  it("fails the Task at once on a permanent error, with no retry", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const ai = createFakeAiProvider(() => {
      throw new AiProviderError("The AI service refused the request.");
    });
    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");

    expect(await runContentTask(requested.value.id, ai, { isFinalAttempt: false })).toBe("DONE");

    expect(await getTask(mia, workspaceId, requested.value.id)).toMatchObject({
      ok: true,
      value: { status: "FAILED", error: "The AI service refused the request." },
    });
  });
});

describe("AI usage", () => {
  const USAGE = { model: "mistral-small-2603", inputTokens: 1200, outputTokens: 900 } as const;
  // Mistral Small 4 at $0.15 / $0.60 per million tokens: 180 + 540 micro-dollars.
  const COST_MICRO_USD = 720;

  it("is recorded on the Task with its estimated cost", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const ai = createFakeAiProvider(() => POSTS, { usage: USAGE });

    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");
    expect(await getTask(mia, workspaceId, requested.value.id)).toMatchObject({ ok: true, value: { aiUsage: null } });
    await runContentTask(requested.value.id, ai);

    expect(await getTask(mia, workspaceId, requested.value.id)).toMatchObject({
      ok: true,
      value: { status: "IN_REVIEW", aiUsage: { ...USAGE, costMicroUsd: COST_MICRO_USD } },
    });
  });

  it("is recorded when the answer was billed but failed validation", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const ai = createFakeAiProvider(() => ({ variants: [] }), { usage: USAGE });

    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");
    await runContentTask(requested.value.id, ai);

    expect(await getTask(mia, workspaceId, requested.value.id)).toMatchObject({
      ok: true,
      value: { status: "FAILED", aiUsage: { ...USAGE, costMicroUsd: COST_MICRO_USD } },
    });
  });
});

describe("another Workspace's content", () => {
  it("can't be requested: its Brand is not found and nothing is queued", async () => {
    const { workspaceId, brandId } = await setUpBrand();
    const outsider = await createTestUser("Oscar");
    const outsiderWorkspaceId = await createTestWorkspace(outsider, "other-agency");
    const { startTask, startedTaskIds } = recordingStartTask();

    for (const targetWorkspaceId of [workspaceId, outsiderWorkspaceId]) {
      const result = await requestContent(outsider, targetWorkspaceId, brandId, LAUNCH_POST, startTask);
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    expect(startedTaskIds).toEqual([]);
    expect(await listTasks(outsider, outsiderWorkspaceId)).toEqual({ ok: true, value: [] });
  });

  it("can't be read: its Tasks and Reviews are not found and not listed", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");
    const taskId = requested.value.id;
    await runContentTask(taskId, createFakeAiProvider(() => POSTS));
    const outsider = await createTestUser("Oscar");
    const outsiderWorkspaceId = await createTestWorkspace(outsider, "other-agency");

    for (const targetWorkspaceId of [workspaceId, outsiderWorkspaceId]) {
      expect(await getTask(outsider, targetWorkspaceId, taskId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await getReview(outsider, targetWorkspaceId, taskId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    expect(await listTasks(outsider, workspaceId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await listTasks(outsider, outsiderWorkspaceId)).toEqual({ ok: true, value: [] });
  });
});

describe("a content Task that fails", () => {
  it("is FAILED with the AI's error, has no Review, and the failure is in the Activity Log", async () => {
    const { owner, mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const ai = createFakeAiProvider(() => {
      throw new AiProviderError("The AI service is unavailable.");
    });

    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");
    const taskId = requested.value.id;
    await runContentTask(taskId, ai);

    expect(await getTask(mia, workspaceId, taskId)).toMatchObject({
      ok: true,
      value: { status: "FAILED", error: "The AI service is unavailable.", variantCount: 0, finishedAt: expect.any(Date) },
    });
    expect(await getReview(mia, workspaceId, taskId)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const activity = await listActivity(owner, workspaceId);
    expect(activity).toMatchObject({
      ok: true,
      value: [
        {
          event: "TASK_FAILED",
          actorName: null,
          brand: { id: brandId },
          taskId,
          details: { error: "The AI service is unavailable." },
        },
        { event: "BRAND_CREATED" },
      ],
    });
  });

  it.each([
    ["a Variant has no body", LAUNCH_POST, { variants: [{ text: POST_TEXT }, ...POSTS.variants.slice(1)] }],
    ["there are fewer than three Variants", LAUNCH_POST, { variants: POSTS.variants.slice(0, 2) }],
    ["an Email Variant has no subject", WELCOME_EMAIL, { variants: [{ body: "Hi" }, ...EMAILS.variants.slice(1)] }],
  ])("is FAILED, with nothing saved and the failure logged, when %s", async (_case, request, reply) => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const ai = createFakeAiProvider(() => reply);

    const requested = await requestContent(mia, workspaceId, brandId, request, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");
    await runContentTask(requested.value.id, ai);

    expect(await getTask(mia, workspaceId, requested.value.id)).toMatchObject({
      ok: true,
      value: { status: "FAILED", error: AI_OUTPUT_INVALID, variantCount: 0 },
    });
    expect(await listActivity(mia, workspaceId)).toMatchObject({
      ok: true,
      value: [{ event: "TASK_FAILED", details: { error: AI_OUTPUT_INVALID } }, { event: "BRAND_CREATED" }],
    });
  });

  it("is FAILED with a generic message on an unexpected error, which is rethrown for the background runner", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const { startTask } = recordingStartTask();
    const bug = new Error("internal detail that members must not see");
    const ai = createFakeAiProvider(() => {
      throw bug;
    });
    const requested = await requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask);
    if (!requested.ok) throw new Error("expected the request to succeed");

    await expect(runContentTask(requested.value.id, ai)).rejects.toBe(bug);

    expect(await getTask(mia, workspaceId, requested.value.id)).toMatchObject({
      ok: true,
      value: { status: "FAILED", error: TASK_FAILED_UNEXPECTEDLY },
    });
    expect(await listActivity(mia, workspaceId)).toMatchObject({
      ok: true,
      value: [{ event: "TASK_FAILED", details: { error: TASK_FAILED_UNEXPECTEDLY } }, { event: "BRAND_CREATED" }],
    });
  });

  it("is FAILED and logged when its background run can't be started", async () => {
    const { mia, workspaceId, brandId } = await setUpBrand();
    const outage = new Error("event API unreachable");
    const startTask: StartTask = async () => {
      throw outage;
    };

    await expect(requestContent(mia, workspaceId, brandId, LAUNCH_POST, startTask)).rejects.toBe(outage);

    expect(await listTasks(mia, workspaceId)).toMatchObject({ ok: true, value: [{ status: "FAILED" }] });
    expect(await listActivity(mia, workspaceId)).toMatchObject({
      ok: true,
      value: [{ event: "TASK_FAILED", details: { error: TASK_START_FAILED } }, { event: "BRAND_CREATED" }],
    });
  });
});
