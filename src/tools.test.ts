import { executeTool } from "./tools.ts";

console.log("=== Test: run_command ===");
const out = await executeTool("run_command", {
  command: "npm create vite@latest /tmp/test-app -- --template react-ts 2>&1",
});
console.log("Output:\n", out);
