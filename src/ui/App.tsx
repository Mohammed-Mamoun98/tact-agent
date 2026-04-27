import { useState, useCallback, useRef, useEffect } from "react";
import { Text, Box } from "ink";
import { PlanView } from "./PlanView.tsx";
import { ConfirmPrompt } from "./ConfirmPrompt.tsx";
import { AgentProgress, type StepState } from "./AgentProgress.tsx";
import { TextInput } from "./TextInput.tsx";
import { StreamingText } from "./StreamingText.tsx";
import { generatePlan, type Plan } from "../planner.ts";
import { runAgent, type AgentCallbacks } from "../agent.ts";
import { callLLMStream, type Message } from "../llm.ts";
import { parseCommand, executeCommand, type AgentState } from "../commands.ts";
import { getModel } from "../config.ts";
import type { Config } from "../config.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

type Phase =
  | { tag: "idle"; error?: string; lastReply?: string }
  | { tag: "thinking"; startTime: number }
  | { tag: "streaming"; content: string }
  | { tag: "planning" }
  | { tag: "confirming"; plan: Plan }
  | { tag: "running"; plan: Plan; steps: StepState[] }
  | { tag: "done"; plan: Plan; steps: StepState[] };

interface Props {
  config: Config;
  grounding: string;
  state: AgentState;
}

function Header() {
  const version = getVersion();

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={2} paddingY={1}>
      <Box>
        <Text bold color="white">tact-agent</Text>
        <Text dimColor> ({version})</Text>
      </Box>
    </Box>
  );
}

function Tip() {
  return (
    <Box marginTop={1} marginBottom={1}>
      <Text bold>Tip: </Text>
      <Text dimColor>Use /plan to execute tasks step-by-step.</Text>
    </Box>
  );
}

function StatusLine({ config }: { config: Config }) {
  const alias = config.model_preferences?.default ?? config.providers[0].models[0].alias;
  const cwd = process.cwd();

  return (
    <Box marginTop={1}>
      <Text dimColor>{alias} · {cwd}</Text>
    </Box>
  );
}

function useElapsedTimer(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);
  return elapsed;
}

export function App({ config, grounding, state }: Props) {
  const [phase, setPhase] = useState<Phase>({ tag: "idle" });
  const [input, setInput] = useState("");
  const historyRef = useRef<Message[]>([]);
  const abortRef = useRef(false);

  const elapsed = useElapsedTimer(phase.tag === "thinking");

  const chat = useCallback(
    async (userMessage: string) => {
      abortRef.current = false;
      historyRef.current.push({ role: "user", content: userMessage });
      setPhase({ tag: "streaming", content: "" });

      const model = getModel(
        config.model_preferences?.default ?? config.providers[0].models[0].alias,
      );

      const messages: Message[] = [
        { role: "system", content: grounding },
        ...historyRef.current,
      ];

      try {
        let fullContent = "";

        await callLLMStream(model, messages, {
          onToken: (token) => {
            if (abortRef.current) return;
            fullContent += token;
            setPhase({ tag: "streaming", content: fullContent });
          },
          onDone: () => {
            if (abortRef.current) return;
            historyRef.current.push({ role: "assistant", content: fullContent });
            if (historyRef.current.length > 40) {
              historyRef.current = historyRef.current.slice(-40);
            }
            setPhase({ tag: "idle", lastReply: fullContent });
          },
          onError: (e) => {
            if (!abortRef.current) {
              setPhase({ tag: "idle", error: e.message });
            }
          },
        });
      } catch (e: any) {
        if (!abortRef.current) {
          setPhase({ tag: "idle", error: e.message });
        }
      }
    },
    [grounding, config],
  );

  const startPlanning = useCallback(
    async (task: string) => {
      setPhase({ tag: "planning" });
      try {
        const plan = await generatePlan(task, grounding, config);
        setPhase({ tag: "confirming", plan });
      } catch (e: any) {
        setPhase({ tag: "idle", error: e.message });
      }
    },
    [grounding, config],
  );

  const submitInput = useCallback(
    async (text: string) => {
      const cmd = parseCommand(text);
      if (cmd) {
        await executeCommand(cmd, state, startPlanning);
        return;
      }
      await chat(text);
    },
    [state, startPlanning, chat],
  );

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    submitInput(text);
  }, [input, submitInput]);

  const handleCancel = useCallback(() => {
    if (phase.tag === "thinking" || phase.tag === "streaming") {
      abortRef.current = true;
      setPhase({ tag: "idle", lastReply: "(interrupted)" });
    }
  }, [phase.tag]);

  const startExecution = useCallback(
    async (plan: Plan) => {
      const initialSteps: StepState[] = plan.steps.map((s, i) => ({
        index: i,
        status: "pending" as const,
        description: s.description,
        model: undefined,
        toolCalls: [],
      }));

      setPhase({ tag: "running", plan, steps: [...initialSteps] });

      const callbacks: AgentCallbacks = {
        onStepStart: (_index, _step) => {
          setPhase((prev) => {
            if (prev.tag !== "running") return prev;
            const updated = [...prev.steps];
            const idx = prev.steps.findIndex((s) => s.status === "pending");
            if (idx >= 0) updated[idx] = { ...updated[idx], status: "running" };
            return { ...prev, steps: updated };
          });
        },
        onStepDone: (_index, _result) => {
          setPhase((prev) => {
            if (prev.tag !== "running") return prev;
            const updated = [...prev.steps];
            const idx = updated.findIndex((s) => s.status === "running");
            if (idx >= 0) updated[idx] = { ...updated[idx], status: "done" };
            return { ...prev, steps: updated };
          });
        },
        onModelSelect: (stepIndex, modelAlias) => {
          setPhase((prev) => {
            if (prev.tag !== "running") return prev;
            const updated = [...prev.steps];
            const idx = updated.findIndex((s) => s.index === stepIndex);
            if (idx >= 0) updated[idx] = { ...updated[idx], model: modelAlias };
            return { ...prev, steps: updated };
          });
        },
        onToolCall: (tool, _input) => {
          setPhase((prev) => {
            if (prev.tag !== "running") return prev;
            const updated = [...prev.steps];
            const idx = updated.findIndex((s) => s.status === "running");
            if (idx >= 0) {
              updated[idx] = { ...updated[idx], toolCalls: [...updated[idx].toolCalls, tool] };
            }
            return { ...prev, steps: updated };
          });
        },
      };

      await runAgent(plan, grounding, state, callbacks);

      setPhase((prev) => {
        if (prev.tag !== "running") return prev;
        return { tag: "done", plan, steps: prev.steps };
      });
    },
    [grounding, state],
  );

  const renderMessages = () =>
    historyRef.current.map((msg, i) => {
      const isUser = msg.role === "user";
      return (
        <Box
          key={i}
          flexDirection="column"
          marginTop={1}
          paddingX={1}
          paddingY={0}
          {...(isUser ? { backgroundColor: "#E8EDF2" } : {})}
        >
          <Text>{msg.content}</Text>
        </Box>
      );
    });

  switch (phase.tag) {
    case "idle":
      return (
        <Box flexDirection="column" padding={1}>
          <Header />
          <Tip />
          {phase.error && (
            <Box marginTop={1}>
              <Text color="red">{phase.error}</Text>
            </Box>
          )}
          {renderMessages()}
          <Box
            marginTop={1}
            borderStyle="round"
            borderColor="gray"
            paddingX={1}
            paddingY={0}
          >
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              placeholder="Type a message..."
            />
          </Box>
          <StatusLine config={config} />
        </Box>
      );

    case "streaming":
      return (
        <Box flexDirection="column" padding={1}>
          <Header />
          {renderMessages()}
          <Box marginTop={1} paddingX={1} paddingY={0}>
            <StreamingText content={phase.content} />
          </Box>
        </Box>
      );

    case "thinking": {
      const seconds = elapsed;
      return (
        <Box flexDirection="column" padding={1}>
          <Header />
          {renderMessages()}
          <Box marginTop={1}>
            <Text color="cyan">● </Text>
            <Text bold>Working</Text>
            <Text dimColor> ({seconds}s • esc to interrupt)</Text>
          </Box>
        </Box>
      );
    }

    case "planning":
      return (
        <Box flexDirection="column" padding={1}>
          <Header />
          <Box marginTop={1}>
            <Text dimColor>Generating plan...</Text>
          </Box>
        </Box>
      );

    case "confirming":
      return (
        <Box flexDirection="column" padding={1}>
          <Header />
          <PlanView plan={phase.plan} />
          <ConfirmPrompt
            onConfirm={() => startExecution(phase.plan)}
            onReject={() => setPhase({ tag: "idle" })}
          />
        </Box>
      );

    case "running":
      return (
        <Box flexDirection="column" padding={1}>
          <Header />
          <AgentProgress plan={phase.plan} steps={phase.steps} />
          <Box marginTop={1}>
            <Text dimColor>
              Step {state.currentStep}/{state.totalSteps} · ~{state.tokenCount} tokens
            </Text>
          </Box>
        </Box>
      );

    case "done":
      return (
        <Box flexDirection="column" padding={1}>
          <Header />
          <AgentProgress plan={phase.plan} steps={phase.steps} />
          <Box marginTop={1}>
            <Text bold color="green">
              All {state.totalSteps} steps complete.
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press Enter to go back</Text>
          </Box>
        </Box>
      );
  }
}
