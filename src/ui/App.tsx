import { useState, useCallback, useRef } from "react";
import { Text, Box, useInput } from "ink";
import { PlanView } from "./PlanView.tsx";
import { ConfirmPrompt } from "./ConfirmPrompt.tsx";
import { AgentProgress, type StepState } from "./AgentProgress.tsx";
import { generatePlan, type Plan } from "../planner.ts";
import { runAgent, type AgentCallbacks } from "../agent.ts";
import { callLLM, type Message } from "../llm.ts";
import { parseCommand, executeCommand, type AgentState } from "../commands.ts";
import { getModel } from "../config.ts";
import type { Config } from "../config.ts";

type Phase =
  | { tag: "idle"; error?: string; lastReply?: string }
  | { tag: "thinking" }
  | { tag: "planning" }
  | { tag: "confirming"; plan: Plan }
  | { tag: "running"; plan: Plan; steps: StepState[] }
  | { tag: "done"; plan: Plan; steps: StepState[] };

interface Props {
  config: Config;
  grounding: string;
  state: AgentState;
}

export function App({ config, grounding, state }: Props) {
  const [phase, setPhase] = useState<Phase>({ tag: "idle" });
  const [input, setInput] = useState("");
  const historyRef = useRef<Message[]>([]);

  // Direct chat — no plan, just respond
  const chat = useCallback(
    async (userMessage: string) => {
      setPhase({ tag: "thinking" });

      const model = getModel(
        config.model_preferences?.default ?? config.providers[0].models[0].alias,
      );

      const messages: Message[] = [
        { role: "system", content: grounding },
        ...historyRef.current,
        { role: "user", content: userMessage },
      ];

      try {
        const res = await callLLM(model, messages);

        if (res.type === "tool_use") {
          // If the model calls a tool during chat, treat it as a task → route to plan
          setPhase({ tag: "idle", lastReply: "(detected task intent — use /plan for execution)" });
          return;
        }

        historyRef.current.push(
          { role: "user", content: userMessage },
          { role: "assistant", content: res.content },
        );

        // Keep only last 20 messages
        if (historyRef.current.length > 40) {
          historyRef.current = historyRef.current.slice(-40);
        }

        setPhase({ tag: "idle", lastReply: res.content });
      } catch (e: any) {
        setPhase({ tag: "idle", error: e.message });
      }
    },
    [grounding, config],
  );

  // Plan mode — explicit via /plan command
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

  // Route input: commands → plan, everything else → chat
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

  useInput((char, key) => {
    if (phase.tag !== "idle" && phase.tag !== "done") return;

    if (key.return && input.trim()) {
      const text = input.trim();
      setInput("");
      submitInput(text);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (char.length === 1 && !key.ctrl) {
      setInput((prev) => prev + char);
    }
  });

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

  // Done → Enter to go back to idle; /plan from done
  useInput((_char, key) => {
    if (phase.tag !== "done") return;
    if (key.return) setPhase({ tag: "idle" });
  });

  switch (phase.tag) {
    case "idle":
      return (
        <Box flexDirection="column" padding={1}>
          <Box>
            <Text bold color="cyan">
              tact
            </Text>
            <Text dimColor> — minimal AI coding agent</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>/plan to execute tasks · anything else is chat</Text>
          </Box>
          {phase.error && (
            <Box marginTop={1}>
              <Text color="red">{phase.error}</Text>
            </Box>
          )}
          {phase.lastReply && (
            <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
              <Text>{phase.lastReply}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="yellow">{"> "}</Text>
            <Text>{input}</Text>
            <Text dimColor>█</Text>
          </Box>
        </Box>
      );

    case "thinking":
      return (
        <Box padding={1}>
          <Text dimColor>…</Text>
        </Box>
      );

    case "planning":
      return (
        <Box padding={1}>
          <Text dimColor>Generating plan...</Text>
        </Box>
      );

    case "confirming":
      return (
        <Box flexDirection="column" padding={1}>
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
