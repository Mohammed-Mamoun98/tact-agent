import { loadConfig } from "./config.ts";
import { selectModel } from "./model-router.ts";
import type { Task } from "./model-router.ts";

const config = loadConfig();

console.log("=== Test 1: Low complexity feature_creation ===");
const task1: Task = { category: "feature_creation", complexity: "low", attempts: 0 };
const m1 = selectModel(task1, config);
console.log(`  Selected: ${m1.alias} (${m1.id})`);

console.log("\n=== Test 2: Vision task ===");
const task2: Task = { category: "vision", complexity: "mid", attempts: 0 };
const m2 = selectModel(task2, config);
console.log(`  Selected: ${m2.alias} (${m2.id})`);

console.log("\n=== Test 3: Task with 3 failed attempts (escalation) ===");
const task3: Task = { category: "refactoring", complexity: "low", attempts: 3 };
const m3 = selectModel(task3, config);
console.log(`  Selected: ${m3.alias} (${m3.id})`);
