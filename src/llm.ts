import type { Model } from "./config.ts";

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type LLMResponse =
  | { type: "text"; content: string }
  | { type: "tool_use"; name: string; input: unknown; id: string };

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

export async function callLLM(
  model: Model,
  messages: Message[],
  tools?: Tool[],
): Promise<LLMResponse> {
  const url = `${model.provider.api_url}/chat/completions`;

  const body: Record<string, unknown> = {
    model: model.id,
    messages: messages.map(toOpenAIMessage),
    max_tokens: 4096,
  };

  if (tools?.length) {
    body.tools = tools;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${model.provider.api_key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) throw new Error(`Invalid API key for ${model.provider.name}`);
    if (res.status === 404) throw new Error(`Model "${model.id}" not found on ${model.provider.name}`);
    if (res.status === 429) throw new Error(`Rate limited by ${model.provider.name}`);
    throw new Error(`LLM error (${res.status}): ${text}`);
  }

  const json = await res.json();
  const choice = json.choices?.[0];
  if (!choice?.message) {
    throw new Error(`Empty response from ${model.provider.name}`);
  }

  const msg = choice.message;

  if (msg.tool_calls?.length) {
    const tc = msg.tool_calls[0];
    return {
      type: "tool_use",
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments),
      id: tc.id,
    };
  }

  return { type: "text", content: msg.content ?? "" };
}

function toOpenAIMessage(m: Message): OpenAIMessage {
  const msg: OpenAIMessage = {
    role: m.role,
    content: m.tool_calls ? null : m.content,
  };
  if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
  if (m.tool_calls) msg.tool_calls = m.tool_calls;
  return msg;
}
