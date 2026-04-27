import { mkdtempSync, rmSync } from "node:fs";
import { loadConfig } from "./config.ts";
import { loadGroundingPrompt } from "./grounding.ts";
import { runAgent } from "./agent.ts";
import type { AgentState } from "./commands.ts";
import type { Plan } from "./planner.ts";

const config = loadConfig();
const grounding = await loadGroundingPrompt();

const workdir = mkdtempSync("/tmp/tact-agent-test-");

const state: AgentState = {
  config,
  messages: [],
  currentStep: 0,
  totalSteps: 0,
  tokenCount: 0,
  modelOverride: null,
  lastWrite: null,
  stepResults: [],
};

const plan: Plan = {
  goal: "Scaffold a Vite React TypeScript project in a temp directory",
  steps: [
    {
      id: 1,
      description: `Run pnpm create vite to scaffold a new React TypeScript project at ${workdir}`,
      tool: "run_command",
      category: "simple",
      complexity: "low",
    },
    {
      id: 2,
      description: `Install project dependencies in ${workdir}`,
      tool: "run_command",
      category: "simple",
      complexity: "low",
    },
    {
      id: 3,
      description: `List the contents of ${workdir} to verify scaffold`,
      tool: "list_directory",
      category: "simple",
      complexity: "low",
    },
  ],
};

console.log(`Working directory: ${workdir}\n`);
await runAgent(plan, grounding, state);

console.log("Cleaning up...");
rmSync(workdir, { recursive: true, force: true });
console.log("Done.");
