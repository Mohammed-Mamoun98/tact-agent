import { getModel, loadConfig } from "./config.ts";

// Verify config loads and resolves
const config = loadConfig();
console.log("Providers:", config.providers.map((p) => p.name));

// Test getModel
const haiku = getModel("claude-haiku");
console.log("\ngetModel('claude-haiku'):");
console.log("  id:", haiku.id);
console.log("  alias:", haiku.alias);
console.log("  capabilities:", haiku.capabilities);
console.log("  provider:", haiku.provider.name);
console.log("  api_url:", haiku.provider.api_url);

// Test missing model
try {
  getModel("nonexistent");
} catch (e: any) {
  console.log("\nMissing model error:", e.message);
}

console.log("\nOK");
