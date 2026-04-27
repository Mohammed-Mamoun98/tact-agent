import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load as parseYaml } from "js-yaml";
import { z } from "zod";

const ModelSchema = z.object({
  id: z.string().min(1),
  alias: z.string().min(1),
  capabilities: z.array(z.string()),
});

const ProviderSchema = z.object({
  name: z.string().min(1),
  api_url: z.string().url(),
  api_key: z.string().min(1),
  models: z.array(ModelSchema).min(1),
});

const ConfigSchema = z.object({
  providers: z.array(ProviderSchema).min(1),
  model_preferences: z
    .object({
      default: z.string().optional(),
      fast: z.string().optional(),
      architect: z.string().optional(),
    })
    .optional(),
});

export type Model = z.infer<typeof ModelSchema> & { provider: Provider };
export type Provider = z.infer<typeof ProviderSchema>;
export type Config = z.infer<typeof ConfigSchema>;

function resolveEnvVars(value: string): string {
  return value.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, name) => {
    const env = process.env[name];
    if (!env) {
      throw new Error(`Environment variable ${name} is not set`);
    }
    return env;
  });
}

let _config: Config | null = null;

export function loadConfig(configPath?: string): Config {
  if (_config) return _config;

  const path = configPath ?? resolve(process.cwd(), "agent.config.yaml");
  const raw = readFileSync(path, "utf-8");
  const parsed = parseYaml(raw);

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config:\n${issues}`);
  }

  for (const provider of result.data.providers) {
    provider.api_key = resolveEnvVars(provider.api_key);
  }

  _config = result.data;
  return _config;
}

export function getModel(alias: string): Model {
  const config = loadConfig();
  for (const provider of config.providers) {
    const model = provider.models.find((m) => m.alias === alias);
    if (model) {
      return { ...model, provider };
    }
  }
  throw new Error(`Model alias "${alias}" not found in config`);
}

export function getProvider(name: string): Provider {
  const config = loadConfig();
  const provider = config.providers.find((p) => p.name === name);
  if (!provider) throw new Error(`Provider "${name}" not found in config`);
  return provider;
}
