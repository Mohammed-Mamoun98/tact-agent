import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import type { Tool } from "./llm.ts";

export const TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given path.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file, overwriting if it exists.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command and return its output.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List the contents of a directory, 2 levels deep.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative directory path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
];

type ToolFn = (input: any) => Promise<string> | string;

type WriteRecord = { path: string; oldContent: string | null };
let writeTracker: ((rec: WriteRecord) => void) | null = null;

export function setWriteTracker(fn: ((rec: WriteRecord) => void) | null): void {
  writeTracker = fn;
}

const handlers: Record<string, ToolFn> = {
  read_file(input) {
    const path = resolve(input.path);
    if (!existsSync(path)) return `Error: file not found: ${path}`;
    return readFileSync(path, "utf-8");
  },

  write_file(input) {
    const path = resolve(input.path);
    const oldContent = existsSync(path) ? readFileSync(path, "utf-8") : null;
    writeFileSync(path, input.content, "utf-8");
    if (writeTracker) writeTracker({ path, oldContent });
    return `Wrote ${input.content.length} bytes to ${path}`;
  },

  run_command(input) {
    try {
      const output = execSync(input.command, {
        encoding: "utf-8",
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return output || "(exit 0, no output)";
    } catch (e: any) {
      return e.stdout || e.stderr || e.message;
    }
  },

  list_directory(input) {
    const path = resolve(input.path);
    if (!existsSync(path)) return `Error: directory not found: ${path}`;
    if (!statSync(path).isDirectory()) return `Error: not a directory: ${path}`;
    return renderTree(path, 2);
  },

  web_search(_input) {
    return "web_search: not implemented";
  },
};

export async function executeTool(name: string, input: unknown): Promise<string> {
  const started = Date.now();
  const handler = handlers[name];
  if (!handler) return `Error: unknown tool "${name}"`;

  console.log(`[tool:${name}] running...`);
  const result = await handler(input);
  const ms = Date.now() - started;
  console.log(`[tool:${name}] done (${ms}ms)`);
  return result;
}

function renderTree(base: string, maxDepth: number): string {
  const lines: string[] = [base];
  walk(base, "", 0, maxDepth, lines);
  return lines.join("\n");

  function walk(dir: string, prefix: string, depth: number, max: number, out: string[]) {
    if (depth >= max) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    entries.forEach((e, i) => {
      const last = i === entries.length - 1;
      const connector = last ? "└── " : "├── ";
      out.push(`${prefix}${connector}${e.name}`);
      if (e.isDirectory()) {
        walk(join(dir, e.name), prefix + (last ? "    " : "│   "), depth + 1, max, out);
      }
    });
  }
}
