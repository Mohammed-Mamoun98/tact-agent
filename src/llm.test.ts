import { getModel } from "./config.ts";
import { callLLM } from "./llm.ts";

const model = getModel("claude-haiku");

const res = await callLLM(model, [{ role: "user", content: "Say hello in exactly 3 words." }]);

if (res.type === "text") {
  console.log("text:", res.content);
} else {
  console.log("tool_use:", res.name, res.input);
}
