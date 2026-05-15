import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaUsage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Dish, RecommendRequest } from "@shared/types";
import { STATIC_PROMPT, buildDynamicContext } from "./prompt";
import { CORRECTION_MESSAGE, parseDishes } from "./parser";
import { AnthropicWrapperError, type AnthropicErrorCode } from "./errors";

// Re-export so existing callers (routes/recommend.ts, anthropic.test.ts) can
// continue importing the error class from the SDK facade module. The canonical
// home is ./errors — parser.ts depends on it directly to avoid the cycle.
export { AnthropicWrapperError, type AnthropicErrorCode } from "./errors";

const MODEL = "claude-sonnet-4-6";
const MCP_SERVER_URL = "https://mcp.swiggy.com/food";
const MCP_BETA = "mcp-client-2025-04-04";
const MAX_TOOL_ITERATIONS = 5;
const MAX_PARSE_ATTEMPTS = 2;
const MAX_TOKENS = 4096;

// SDK 0.30.x doesn't yet type the `mcp_servers` request parameter for the
// MCP connector beta. Verified against versions through 0.95.x; bumping
// doesn't add the field. We define the local extras type and apply one
// localized cast at the single call site below. Trivial cleanup if/when
// the SDK adds the field.
type McpServerConfig = {
  type: "url";
  url: string;
  name: string;
};
type ParamsWithMcp = MessageCreateParamsNonStreaming & {
  mcp_servers: McpServerConfig[];
};

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new AnthropicWrapperError(
      "internal_error",
      "Anthropic credentials not configured",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

function buildParams(
  dynamicContext: string,
  messages: BetaMessageParam[],
): ParamsWithMcp {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: STATIC_PROMPT,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: dynamicContext },
    ],
    messages,
    betas: [MCP_BETA],
    mcp_servers: [
      { type: "url", url: MCP_SERVER_URL, name: "swiggy" },
    ],
  };
}

// resp.content is BetaContentBlock[] (output union); BetaMessageParam.content
// wants BetaContentBlockParam[] (input union). Text blocks are shape-compatible
// but the types are nominally distinct, so we narrow and rebuild. tool_use
// blocks on this path are unreachable — the wrapper rejects stop_reason
// "tool_use" before this helper runs.
function assistantContentForRetry(
  content: BetaContentBlock[],
): BetaContentBlockParam[] {
  const blocks: BetaContentBlockParam[] = content
    .filter((b): b is Extract<BetaContentBlock, { type: "text" }> =>
      b.type === "text",
    )
    .map((b) => ({ type: "text", text: b.text }));
  return blocks.length > 0
    ? blocks
    : [{ type: "text", text: "(empty response)" }];
}

// TODO: Refine once real MCP error messages are observed in
// production — substring matching on err.message is brittle. If a debug
// log path is added inside this function, log err.status / err.name only,
// never err.message (the SDK message can carry request IDs / partial URLs).
//
// `APIError` is re-exported from the SDK index as a `const` (value), not a
// class binding, so `InstanceType<typeof ...>` is the way to get its
// instance type. The runtime `instanceof APIError` check below works fine
// because the value IS the class constructor.
function classifyApiError(
  err: InstanceType<typeof APIError>,
): AnthropicWrapperError {
  const msg = err.message ?? "";
  const lower = msg.toLowerCase();
  if (lower.includes("mcp") || lower.includes("connector")) {
    return new AnthropicWrapperError("mcp_error", "MCP request failed");
  }
  return new AnthropicWrapperError("model_error", "Model request failed");
}

export async function runRecommend(
  input: RecommendRequest,
  requestId: string,
): Promise<Dish[]> {
  const startedAt = Date.now();
  let toolIterations = 0;
  let parseAttempts = 0;
  let lastUsage: BetaUsage | null = null;
  let status: AnthropicErrorCode | "ok" = "ok";

  try {
    const client = getClient();
    const dynamicContext = buildDynamicContext(input);
    const messages: BetaMessageParam[] = [
      { role: "user", content: "Recommend 5 dishes." },
    ];

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      toolIterations = i + 1;
      const params = buildParams(dynamicContext, messages);
      let resp;
      try {
        resp = await client.beta.messages.create(
          params as MessageCreateParamsNonStreaming,
        );
      } catch (err) {
        if (err instanceof APIError) throw classifyApiError(err);
        throw err;
      }
      lastUsage = resp.usage;

      if (resp.stop_reason === "end_turn") {
        parseAttempts++;
        const result = parseDishes(resp.content);
        if (result.ok) return result.dishes;
        if (parseAttempts >= MAX_PARSE_ATTEMPTS) throw result.error;
        messages.push({
          role: "assistant",
          content: assistantContentForRetry(resp.content),
        });
        messages.push({ role: "user", content: CORRECTION_MESSAGE });
        continue;
      }

      if (resp.stop_reason === "tool_use") {
        // No client-side tools are attached — only mcp_servers. Under the
        // connector beta, MCP tool calls should resolve server-side and
        // surface only text content with stop_reason "end_turn". If
        // tool_use blocks appear anyway, fail loud rather than fabricate
        // empty tool_result echoes that mask bugs. A future item can add
        // real round-tripping once empirical behavior is observed.
        throw new AnthropicWrapperError(
          "model_error",
          "Received tool_use blocks but no client tools are defined",
        );
      }

      // Wrapper messages are always hardcoded strings — never interpolate
      // upstream-API values into a message that the route forwards to the
      // HTTP response body. The raw stop_reason is intentionally not echoed.
      throw new AnthropicWrapperError(
        "model_error",
        "Unexpected stop reason from model",
      );
    }

    throw new AnthropicWrapperError(
      "model_error",
      `Tool-use loop exceeded ${MAX_TOOL_ITERATIONS} iterations`,
    );
  } catch (err) {
    if (err instanceof AnthropicWrapperError) {
      status = err.code;
    } else {
      status = "internal_error";
    }
    throw err;
  } finally {
    // toolIterations counts SDK-call attempts, not completed round-trips —
    // a throw on iteration N still increments to N before the throw.
    const line: Record<string, unknown> = {
      t: new Date().toISOString(),
      requestId,
      event: "recommend_call",
      durationMs: Date.now() - startedAt,
      toolIterations,
      parseAttempts,
      status,
      cacheReadTokens: lastUsage?.cache_read_input_tokens ?? null,
      cacheCreationTokens: lastUsage?.cache_creation_input_tokens ?? null,
    };
    if (process.env.NODE_ENV !== "test") {
      console.log(JSON.stringify(line));
    }
  }
}
