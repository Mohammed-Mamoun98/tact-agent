import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const AGENT_FILE = "AGENT.md";
const PROJECT_FILE = "PROJECT.md";

export async function loadGroundingPrompt(cwd?: string): Promise<string> {
  const dir = cwd ?? process.cwd();
  const parts: string[] = [];

  // AGENT.md — global soul, lives alongside the package
  const agentPath = resolve(dir, AGENT_FILE);
  if (existsSync(agentPath)) {
    const body = readFileSync(agentPath, "utf-8").trim();
    parts.push(`## Agent Soul (${AGENT_FILE})\n\n${body}`);
  } else {
    console.warn(`[grounding] ${AGENT_FILE} not found at ${agentPath}`);
  }

  // PROJECT.md — optional project-scoped guidance
  const projectPath = resolve(process.cwd(), PROJECT_FILE);
  if (existsSync(projectPath)) {
    const body = readFileSync(projectPath, "utf-8").trim();
    parts.push(`## Project Context (${PROJECT_FILE})\n\n${body}`);
  }

  return parts.join("\n\n");
}
