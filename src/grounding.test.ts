import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { loadGroundingPrompt } from "./grounding.ts";

// Create a dummy PROJECT.md for the test
const tmpProject = resolve(process.cwd(), "PROJECT.md");
writeFileSync(tmpProject, "This is a test project.\nIt builds a CLI tool called tact.");

const prompt = await loadGroundingPrompt();

console.log(prompt);
console.log(`\n---\nLength: ${prompt.length} chars`);

// Cleanup
unlinkSync(tmpProject);
