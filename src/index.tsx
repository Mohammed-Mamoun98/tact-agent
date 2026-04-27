import { render } from "ink";
import { loadConfig } from "./config.ts";
import { loadGroundingPrompt } from "./grounding.ts";
import type { AgentState } from "./commands.ts";
import { App } from "./ui/App.tsx";

const config = loadConfig();
const grounding = await loadGroundingPrompt();

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

render(<App config={config} grounding={grounding} state={state} />);
