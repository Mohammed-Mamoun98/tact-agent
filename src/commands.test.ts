import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { parseCommand, executeCommand, type AgentState } from "./commands.ts";

const config = loadConfig();

function makeState(): AgentState {
  return {
    config,
    messages: [],
    currentStep: 2,
    totalSteps: 5,
    tokenCount: 1200,
    modelOverride: null,
    lastWrite: null,
    stepResults: ["Step 1: done", "Step 2: running"],
  };
}

const noopReplan = async (_: string) => {};

// Test 1: /help
console.log("=== /help ===");
const helpCmd = parseCommand("/help")!;
await executeCommand(helpCmd, makeState(), noopReplan);

// Test 2: /model (list available)
console.log("=== /model (list) ===");
const modelList = parseCommand("/model")!;
await executeCommand(modelList, makeState(), noopReplan);

// Test 3: /model <alias> (set override)
console.log("=== /model claude-haiku ===");
const modelSet = parseCommand("/model claude-haiku")!;
const state3 = makeState();
await executeCommand(modelSet, state3, noopReplan);
console.log(`modelOverride = ${state3.modelOverride}`);

// Test 4: /model <bad alias>
console.log("\n=== /model bogus ===");
const badModel = parseCommand("/model bogus")!;
await executeCommand(badModel, makeState(), noopReplan);

// Test 5: /status
console.log("\n=== /status ===");
const statusCmd = parseCommand("/status")!;
await executeCommand(statusCmd, makeState(), noopReplan);

// Test 6: /undo — with a tracked write
console.log("\n=== /undo (with tracked write) ===");
const testFile = resolve("/tmp/tact-undo-test.txt");
writeFileSync(testFile, "original content", "utf-8");
const undoState = makeState();
undoState.lastWrite = { path: testFile, oldContent: "previous version" };
// Write something new so undo reverts
writeFileSync(testFile, "new content", "utf-8");
const undoCmd = parseCommand("/undo")!;
await executeCommand(undoCmd, undoState, noopReplan);
console.log(`After undo, file content: ${readFileSync(testFile, "utf-8")}`);
unlinkSync(testFile);

// Test 7: /undo — nothing to undo
console.log("\n=== /undo (nothing to undo) ===");
const undo2 = parseCommand("/undo")!;
await executeCommand(undo2, makeState(), noopReplan);

// Test 8: /clear
console.log("\n=== /clear ===");
const clearState = makeState();
const clearCmd = parseCommand("/clear")!;
await executeCommand(clearCmd, clearState, noopReplan);
console.log(`messages: ${clearState.messages.length}, stepResults: ${clearState.stepResults.length}`);

// Test 9: /memory (no MEMORY.md exists)
console.log("\n=== /memory (no file) ===");
const memCmd = parseCommand("/memory")!;
await executeCommand(memCmd, makeState(), noopReplan);

// Test 10: Non-command input returns null
console.log("\n=== parseCommand on regular text ===");
const notCmd = parseCommand("create a vite project");
console.log(`Result: ${notCmd === null ? "null (correct)" : "unexpected"}`);

// Test 11: Unknown command
console.log("\n=== /bogus ===");
const bogus = parseCommand("/bogus")!;
await executeCommand(bogus, makeState(), noopReplan);

console.log("\nDone.");
