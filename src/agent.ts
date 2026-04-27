import type { Config } from "./config.ts";
import type { Plan, PlanStep } from "./planner.ts";
import type { AgentState } from "./commands.ts";
import { selectModel } from "./model-router.ts";
import { callLLM, type Message } from "./llm.ts";
import { executeTool, TOOLS, setWriteTracker } from "./tools.ts";
import { getModel } from "./config.ts";

const MAX_TOOL_ROUNDS = 8;

export interface AgentCallbacks {
  onLog?: (msg: string) => void;
  onStepStart?: (index: number, step: PlanStep) => void;
  onStepDone?: (index: number, result: string) => void;
  onToolCall?: (tool: string, input: unknown) => void;
}

export async function runAgent(
  plan: Plan,
  groundingPrompt: string,
  state: AgentState,
  callbacks?: AgentCallbacks,
): Promise<void> {
  const log = callbacks?.onLog ?? console.log;
  state.currentStep = 0;
  state.totalSteps = plan.steps.length;

  setWriteTracker((rec) => {
    state.lastWrite = rec;
  });

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    state.currentStep = i + 1;
    callbacks?.onStepStart?.(i, step);

    log(`\n${"━".repeat(60)}`);
    log(`[step ${i + 1}/${plan.steps.length}] ${step.description}`);
    log(`${"━".repeat(60)}`);

    const outcome = await executeStep(step, state, groundingPrompt, callbacks);
    state.stepResults.push(`Step ${step.id}: ${outcome}`);
    callbacks?.onStepDone?.(i, outcome);
  }

  setWriteTracker(null);
  log(`\n${"━".repeat(60)}`);
  log("[agent] plan complete");
  log(`${"━".repeat(60)}\n`);
}

async function executeStep(
  step: PlanStep,
  state: AgentState,
  groundingPrompt: string,
  callbacks?: AgentCallbacks,
): Promise<string> {
  const log = callbacks?.onLog ?? console.log;
  let attempts = 0;

  while (attempts <= 3) {
    let model;
    if (state.modelOverride) {
      model = getModel(state.modelOverride);
      log(`[router] using override: ${model.alias}`);
      state.modelOverride = null;
    } else {
      model = selectModel(
        { category: step.category, complexity: step.complexity, attempts },
        state.config,
      );
    }

    const messages = buildMessages(step, state.stepResults, groundingPrompt);

    try {
      const outcome = await toolLoop(model, messages, state, callbacks);
      log(`[step] completed → ${outcome.slice(0, 80)}`);
      return outcome;
    } catch (e: any) {
      attempts++;
      log(`[step] attempt ${attempts} failed: ${e.message}`);
      if (attempts > 3) {
        log(`[step] exhausted retries, marking as failed`);
        return `FAILED after ${attempts} attempts: ${e.message}`;
      }
    }
  }

  return "FAILED";
}

async function toolLoop(
  model: ReturnType<typeof selectModel>,
  messages: Message[],
  state: AgentState,
  callbacks?: AgentCallbacks,
): Promise<string> {
  const log = callbacks?.onLog ?? console.log;
  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    const res = await callLLM(model, messages, TOOLS);

    state.messages = messages;
    const allText = messages.map((m) => m.content).join("");
    state.tokenCount = Math.ceil(allText.length / 4);

    if (res.type === "text") {
      return res.content;
    }

    log(`  [tool] ${res.name} (round ${rounds})`);
    callbacks?.onToolCall?.(res.name, res.input);
    const toolResult = await executeTool(res.name, res.input);

    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: res.id,
          type: "function" as const,
          function: { name: res.name, arguments: JSON.stringify(res.input) },
        },
      ],
    });

    messages.push({
      role: "tool",
      content: toolResult.slice(0, 8000),
      tool_call_id: res.id,
    });
  }

  throw new Error(`Step exceeded ${MAX_TOOL_ROUNDS} tool-call rounds`);
}

function buildMessages(
  step: PlanStep,
  previousResults: string[],
  groundingPrompt: string,
): Message[] {
  const msgs: Message[] = [
    { role: "system", content: groundingPrompt },
  ];

  const context = previousResults.length
    ? `\n\nPrevious steps completed:\n${previousResults.map((r) => `- ${r}`).join("\n")}`
    : "";

  msgs.push({
    role: "user",
    content: [
      `Execute this step using the available tools.`,
      `Step: ${step.description}`,
      `Use tool: ${step.tool}`,
      `Category: ${step.category} | Complexity: ${step.complexity}`,
      `When done, briefly confirm what was accomplished.`,
      context,
    ].join("\n"),
  });

  return msgs;
}
