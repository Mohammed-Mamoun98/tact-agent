import { loadConfig } from "./config.ts";
import { loadGroundingPrompt } from "./grounding.ts";
import { generatePlan, displayPlan, confirmPlan } from "./planner.ts";

const config = loadConfig();
const grounding = await loadGroundingPrompt();

console.log("Generating plan...\n");
const plan = await generatePlan("create a vite react typescript project called tact-ui", grounding, config);

displayPlan(plan);

console.log("Accept this plan?");
const confirmed = await confirmPlan();
console.log(confirmed ? "Plan accepted." : "Plan rejected.");
