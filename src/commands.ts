import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "./config.ts";
import type { Message } from "./llm.ts";

export interface AgentState {
  config: Config;
  messages: Message[];
  currentStep: number;
  totalSteps: number;
  tokenCount: number;
  modelOverride: string | null;
  lastWrite: { path: string; oldContent: string | null } | null;
  stepResults: string[];
}

export interface Command {
  name: string;
  args: string;
}

export type CommandAction =
  | { type: "none" }
  | { type: "replan" }
  | { type: "continue" }
  | { type: "exit" };

const HELP_TEXT = `
Available commands:
  /plan <task>       Enter plan mode — generate + execute a task plan
  /memory            Print current MEMORY.md contents
  /model <alias>     Override model for the next step (empty to show available)
  /clear             Clear message history, keep memory and config
  /status            Show current step, active model, and token estimate
  /undo              Revert the last file write
  /help              Show this list
`;

export function parseCommand(input: string): Command | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const space = trimmed.indexOf(" ");
  if (space === -1) return { name: trimmed.slice(1).toLowerCase(), args: "" };
  return {
    name: trimmed.slice(1, space).toLowerCase(),
    args: trimmed.slice(space + 1).trim(),
  };
}

export async function executeCommand(
  cmd: Command,
  state: AgentState,
  onReplan: (input: string) => Promise<void>,
): Promise<CommandAction> {
  switch (cmd.name) {
    case "plan": {
      if (!cmd.args) {
        console.log("/plan requires a task description. Usage: /plan <task>");
        return { type: "none" };
      }
      console.log(`[cmd] replanning with: ${cmd.args}`);
      await onReplan(cmd.args);
      return { type: "replan" };
    }

    case "memory": {
      const memPath = resolve(process.cwd(), "MEMORY.md");
      if (existsSync(memPath)) {
        console.log(`\n─── MEMORY.md ───\n`);
        console.log(readFileSync(memPath, "utf-8"));
        console.log(`─── end ───\n`);
      } else {
        console.log("No MEMORY.md found in current directory.");
      }
      return { type: "none" };
    }

    case "model": {
      if (!cmd.args) {
        console.log("\nAvailable models:");
        for (const p of state.config.providers) {
          for (const m of p.models) {
            console.log(`  ${m.alias}  (${p.name}/${m.id})`);
          }
        }
        return { type: "none" };
      }
      const found = state.config.providers.some((p) =>
        p.models.some((m) => m.alias === cmd.args),
      );
      if (!found) {
        console.log(`Unknown model "${cmd.args}". Use /model to see available models.`);
        return { type: "none" };
      }
      state.modelOverride = cmd.args;
      console.log(`[cmd] model override set to "${cmd.args}" for next step`);
      return { type: "none" };
    }

    case "clear": {
      state.messages = [];
      state.stepResults = [];
      console.log("[cmd] message history cleared. Config and memory preserved.");
      return { type: "none" };
    }

    case "status": {
      const active = state.modelOverride ?? "auto (router)";
      console.log(`\n  Step:        ${state.currentStep}/${state.totalSteps}`);
      console.log(`  Model:       ${active}`);
      console.log(`  Tokens:      ~${state.tokenCount}`);
      console.log(`  Messages:    ${state.messages.length}`);
      console.log(`  Last write:  ${state.lastWrite?.path ?? "none"}`);
      return { type: "none" };
    }

    case "undo": {
      if (!state.lastWrite) {
        console.log("Nothing to undo — no file writes recorded.");
        return { type: "none" };
      }
      const { path, oldContent } = state.lastWrite;
      if (oldContent !== null) {
        writeFileSync(path, oldContent, "utf-8");
        console.log(`[cmd] reverted ${path} to previous content`);
      } else {
        // File was newly created — remove it? Or just note it.
        console.log(`[cmd] ${path} was newly created. Cannot fully undo (no previous content).`);
      }
      state.lastWrite = null;
      return { type: "none" };
    }

    case "help": {
      console.log(HELP_TEXT);
      return { type: "none" };
    }

    default: {
      console.log(`Unknown command "/${cmd.name}". Type /help for available commands.`);
      return { type: "none" };
    }
  }
}
