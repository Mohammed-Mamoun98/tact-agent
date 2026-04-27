import { createInterface } from "node:readline";
import type { Config } from "./config.ts";
import type { TaskCategory, Complexity } from "./model-router.ts";
import { selectModel } from "./model-router.ts";
import { callLLM } from "./llm.ts";

export interface PlanStep {
  id: number;
  description: string;
  tool: string;
  category: TaskCategory;
  complexity: Complexity;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
}

const SYSTEM_PROMPT = `You are a planning agent. Given a user's request, produce a step-by-step execution plan.

Return ONLY a JSON object. No markdown, no preamble, no explanation. The JSON must match this shape exactly:

{
  "goal": "one-line summary of what will be accomplished",
  "steps": [
    {
      "id": 1,
      "description": "what this step does",
      "tool": "run_command | write_file | read_file | list_directory | web_search",
      "category": "simple | planning | debugging | feature_creation | refactoring | vision",
      "complexity": "low | mid | high"
    }
  ]
}

Rules:
- Steps must be concrete and actionable
- Each step should use exactly one tool
- Order steps logically (scaffold → install → configure → verify)
- Keep steps minimal: 3-7 steps unless the task is genuinely large
- Prefer CLI scaffolding tools (npm create, degit) over manual file creation`;

function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

function parsePlan(raw: string): Plan {
  const json = extractJSON(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Failed to parse plan JSON from response:\n${raw.slice(0, 500)}`);
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.goal !== "string" || !Array.isArray(obj.steps)) {
    throw new Error(`Plan missing required fields (goal, steps):\n${json}`);
  }

  const steps: PlanStep[] = obj.steps.map((s: any, i: number) => {
    if (typeof s.id !== "number") s.id = i + 1;
    return {
      id: s.id as number,
      description: String(s.description ?? ""),
      tool: String(s.tool ?? "run_command"),
      category: (s.category as TaskCategory) ?? "simple",
      complexity: (s.complexity as Complexity) ?? "low",
    };
  });

  return { goal: obj.goal as string, steps };
}

export async function generatePlan(
  userInput: string,
  groundingPrompt: string,
  config: Config,
): Promise<Plan> {
  // Route via the default preference, not "planning" — most inputs are general tasks, not architecture.
  // The system prompt handles JSON structure; any model can follow it.
  const model = selectModel(
    { category: "feature_creation", complexity: "mid", attempts: 0 },
    config,
  );

  const messages : {role:"system" | "user", content:string}[] = [
    { role: "system" as const, content: SYSTEM_PROMPT },
  ];

  if (groundingPrompt) {
    messages.unshift({ role: "system" as const, content: groundingPrompt });
  }

  messages.push({ role: "user" as const, content: userInput });

  const response = await callLLM(model, messages);

  if (response.type === "tool_use") {
    throw new Error("Planner model returned tool_use — expected text");
  }

  return parsePlan(response.content);
}

export function displayPlan(plan: Plan): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Goal: ${plan.goal}`);
  console.log(`${"─".repeat(60)}`);
  for (const step of plan.steps) {
    const cat = `${step.category}/${step.complexity}`;
    console.log(`  ${step.id}. [${step.tool}] ${step.description}  (${cat})`);
  }
  console.log(`${"─".repeat(60)}\n`);
}

export function confirmPlan(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("[y/n/edit] ", (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "y" || a === "yes") resolve(true);
      else if (a === "e" || a === "edit") resolve(false); // edit = not confirmed, caller handles
      else resolve(false);
    });
  });
}
