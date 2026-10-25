import { ConnectionError, MistralError, RequestTimeoutError } from "@mistralai/mistralai/models/errors";
import type {
  ChatCompletionChoiceFinishReason,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "@mistralai/mistralai/models/components";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMistralProvider, type MistralChatClient } from "./mistral-provider";
import { AI_OUTPUT_INVALID, AiProviderError, type AiRequest } from "./provider";

const REQUEST: AiRequest<{ greeting: string }> = {
  system: "You write greetings.",
  prompt: 'Answer with JSON: {"greeting": "<text>"}',
  schema: z.object({ greeting: z.string().min(1) }),
  maxTokens: 500,
};

function reply(content: string, finishReason: ChatCompletionChoiceFinishReason = "stop"): ChatCompletionResponse {
  return {
    id: "cmpl-1",
    object: "chat.completion",
    model: "mistral-small-2603",
    created: 0,
    usage: { promptTokens: 120, completionTokens: 30, totalTokens: 150 },
    choices: [{ index: 0, finishReason, message: { role: "assistant", content } }],
  };
}

// Stands in for the SDK client: records each request and answers with `answer`.
function stubClient(answer: () => ChatCompletionResponse): MistralChatClient & { requests: ChatCompletionRequest[] } {
  const requests: ChatCompletionRequest[] = [];
  return {
    requests,
    chat: {
      async complete(request) {
        requests.push(request);
        return answer();
      },
    },
  };
}

function httpError(status: number): MistralError {
  const body = '{"message": "secret detail from the API"}';
  return new MistralError(`API error occurred: Status ${status}. Body: ${body}`, {
    response: new Response(body, { status }),
    request: new Request("https://api.mistral.ai/v1/chat/completions"),
    body,
  });
}

async function failureOf(promise: Promise<unknown>): Promise<AiProviderError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof AiProviderError)) throw new Error("expected an AiProviderError");
  return error;
}

describe("the Mistral provider", () => {
  it("asks the model for JSON within the max token limit, and returns the validated output with its usage", async () => {
    const client = stubClient(() => reply('{"greeting": "Hello"}'));
    const ai = createMistralProvider(client, "mistral-small-2603");

    const response = await ai.generate(REQUEST);

    expect(response).toEqual({
      output: { greeting: "Hello" },
      usage: { model: "mistral-small-2603", inputTokens: 120, outputTokens: 30 },
    });
    expect(client.requests).toEqual([
      {
        model: "mistral-small-2603",
        maxTokens: 500,
        responseFormat: { type: "json_object" },
        messages: [
          { role: "system", content: REQUEST.system },
          { role: "user", content: REQUEST.prompt },
        ],
      },
    ]);
  });

  it.each([
    ["isn't JSON", "Hello there"],
    ["doesn't match the schema", '{"greeting": ""}'],
  ])("fails permanently, with the usage, when the answer %s", async (_case, content) => {
    const ai = createMistralProvider(stubClient(() => reply(content)), "mistral-small-2603");

    const error = await failureOf(ai.generate(REQUEST));

    expect(error).toMatchObject({
      message: AI_OUTPUT_INVALID,
      transient: false,
      usage: { model: "mistral-small-2603", inputTokens: 120, outputTokens: 30 },
    });
  });

  it("fails permanently, with the usage, when the answer was cut off at the token limit", async () => {
    const ai = createMistralProvider(stubClient(() => reply('{"greeting": "Hel', "length")), "mistral-small-2603");

    const error = await failureOf(ai.generate(REQUEST));

    expect(error).toMatchObject({ transient: false, usage: { inputTokens: 120, outputTokens: 30 } });
    expect(error.message).toMatch(/length limit/);
  });

  it.each([
    ["a rate limit (429)", httpError(429)],
    ["a server error (503)", httpError(503)],
    ["a lost connection", new ConnectionError("fetch failed")],
    ["a timeout", new RequestTimeoutError("timed out")],
  ])("reports %s as transient", async (_case, thrown) => {
    const ai = createMistralProvider(
      stubClient(() => {
        throw thrown;
      }),
      "mistral-small-2603",
    );

    const error = await failureOf(ai.generate(REQUEST));

    expect(error.transient).toBe(true);
    expect(error.message).not.toContain("secret detail");
  });

  it.each([
    ["a bad request (400)", httpError(400)],
    ["a rejected API key (401)", httpError(401)],
  ])("reports %s as permanent, without the API's response in the message", async (_case, thrown) => {
    const ai = createMistralProvider(
      stubClient(() => {
        throw thrown;
      }),
      "mistral-small-2603",
    );

    const error = await failureOf(ai.generate(REQUEST));

    expect(error.transient).toBe(false);
    expect(error.message).not.toContain("secret detail");
  });

  it("reports any other SDK failure as permanent, without its text", async () => {
    const ai = createMistralProvider(
      stubClient(() => {
        throw new Error('Response validation failed: {"message": "secret detail from the API"}');
      }),
      "mistral-small-2603",
    );

    const error = await failureOf(ai.generate(REQUEST));

    expect(error.transient).toBe(false);
    expect(error.message).not.toContain("secret detail");
  });
});
