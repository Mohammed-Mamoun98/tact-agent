import type { Config, Model } from "./config.ts";

export type TaskCategory =
  | "simple"
  | "planning"
  | "debugging"
  | "feature_creation"
  | "refactoring"
  | "vision";

export type Complexity = "low" | "mid" | "high";

export interface Task {
  category: TaskCategory;
  complexity: Complexity;
  attempts: number;
}

const CATEGORY_CAPABILITIES: Record<TaskCategory, string[]> = {
  simple: ["fast-edits", "code"],
  planning: ["reasoning", "architecture"],
  debugging: ["code", "reasoning"],
  feature_creation: ["code", "reasoning"],
  refactoring: ["code"],
  vision: ["vision"],
};

const CATEGORY_PREFERENCE_KEY: Record<TaskCategory, keyof NonNullable<Config["model_preferences"]>> = {
  simple: "fast",
  planning: "architect",
  debugging: "default",
  feature_creation: "default",
  refactoring: "default",
  vision: "default",
};

const CAPABILITY_RANK: Record<string, number> = {
  architecture: 4,
  reasoning: 3,
  code: 2,
  "fast-edits": 1,
  "tool-use": 0,
  vision: 3,
};

function capabilityScore(model: Model): number {
  return model.capabilities.reduce((sum, c) => sum + (CAPABILITY_RANK[c] ?? 0), 0);
}

export function selectModel(
  task: Task,
  config: Config,
): Model {
  // Escalation: attempts > 2 → highest-capability model
  if (task.attempts > 2) {
    const allModels = config.providers.flatMap((p) =>
      p.models.map((m) => ({ ...m, provider: p })),
    );
    const best = allModels.sort((a, b) => capabilityScore(b) - capabilityScore(a))[0];
    console.log(
      `[router] escalated (attempts=${task.attempts}) → ${best.alias} (${best.provider.name}/${best.id})`,
    );
    return best;
  }

  const prefs = config.model_preferences ?? {};

  // (1) User preference for category
  const prefKey = CATEGORY_PREFERENCE_KEY[task.category];
  const preferredAlias = prefs[prefKey];
  if (preferredAlias) {
    const match = findModel(preferredAlias, config);
    if (match) {
      console.log(
        `[router] ${task.category}/${task.complexity} → ${match.alias} (preference: ${prefKey})`,
      );
      return match;
    }
  }

  // (2) Capability match
  const needed = CATEGORY_CAPABILITIES[task.category];
  const allModels = config.providers.flatMap((p) =>
    p.models.map((m) => ({ ...m, provider: p })),
  );
  const byCap = allModels
    .filter((m) => needed.some((c) => m.capabilities.includes(c)))
    .sort((a, b) => capabilityScore(b) - capabilityScore(a));

  const picked = byCap[0];
  if (picked) {
    console.log(
      `[router] ${task.category}/${task.complexity} → ${picked.alias} (capability match: ${needed.filter((c) => picked.capabilities.includes(c)).join(", ")})`,
    );
    return picked;
  }

  // (3) Built-in fallback: first model of first provider
  const fallback = { ...config.providers[0].models[0], provider: config.providers[0] };
  console.log(`[router] ${task.category}/${task.complexity} → ${fallback.alias} (fallback)`);
  return fallback;
}

function findModel(alias: string, config: Config): Model | null {
  for (const provider of config.providers) {
    const model = provider.models.find((m) => m.alias === alias);
    if (model) return { ...model, provider };
  }
  return null;
}
