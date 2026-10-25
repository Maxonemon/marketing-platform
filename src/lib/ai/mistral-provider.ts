import type {
  AssistantMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "@mistralai/mistralai/models/components";
import { ConnectionError, MistralError, RequestTimeoutError } from "@mistralai/mistralai/models/errors";
import type { AiModel } from "./pricing";
import { AI_OUTPUT_INVALID, AiProviderError, parseAiOutput, type AiProvider, type AiUsage } from "./provider";

// The part of the Mistral SDK client this provider uses; tests pass a stub.
export interface MistralChatClient {
  chat: { complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse> };
}

// Shown to members on the failed Task. The SDK's own messages include the API's
// response body, so they are never passed on.
const AI_UNAVAILABLE = "The AI service is busy or unreachable. The Task was retried and still failed.";
const AI_OUTPUT_CUT_OFF = "The AI response was cut off at the length limit.";
const AI_FAILED = "The AI service failed unexpectedly.";
const aiRefused = (status: number) => `The AI service refused the request (HTTP ${status}).`;

const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

// Finish reasons that mean the answer stopped at the token limit, half-written.
const CUT_OFF_REASONS: ReadonlySet<string> = new Set(["length", "model_length"]);

// Mistral behind the provider interface. The model is asked for a JSON object (the
// prompt describes its shape) and its answer is validated against the request's schema.
export function createMistralProvider(client: MistralChatClient, model: AiModel): AiProvider {
  return {
    async generate(request) {
      const response = await complete(client, {
        model,
        maxTokens: request.maxTokens,
        responseFormat: { type: "json_object" },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
      });
      const usage: AiUsage = {
        model,
        inputTokens: response.usage.promptTokens ?? 0,
        outputTokens: response.usage.completionTokens ?? 0,
      };
      const [choice] = response.choices;
      if (choice && CUT_OFF_REASONS.has(choice.finishReason)) throw new AiProviderError(AI_OUTPUT_CUT_OFF, { usage });
      return { output: parseAiOutput(request.schema, parseJson(textOf(choice?.message?.content), usage), usage), usage };
    },
  };
}

async function complete(client: MistralChatClient, request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  try {
    return await client.chat.complete(request);
  } catch (error: unknown) {
    if (error instanceof ConnectionError || error instanceof RequestTimeoutError) {
      throw new AiProviderError(AI_UNAVAILABLE, { transient: true });
    }
    if (error instanceof MistralError) {
      const transient = isTransientStatus(error.statusCode);
      throw new AiProviderError(transient ? AI_UNAVAILABLE : aiRefused(error.statusCode), { transient });
    }
    // Anything else from the SDK (e.g. a response it couldn't read) can carry the API's
    // response in its message, which must not reach logs or the Task.
    throw new AiProviderError(AI_FAILED);
  }
}

// A status that isn't a real HTTP code says nothing about the request: worth a retry.
function isTransientStatus(status: number): boolean {
  if (!Number.isInteger(status) || status <= 0) return true;
  return status === HTTP_REQUEST_TIMEOUT || status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR;
}

// The answer's text: a plain string, or text chunks joined.
function textOf(content: AssistantMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((chunk) => (chunk.type === "text" ? chunk.text : "")).join("");
}

function parseJson(text: string, usage: AiUsage): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AiProviderError(AI_OUTPUT_INVALID, { usage });
  }
}
