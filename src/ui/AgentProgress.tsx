import { Text, Box } from "ink";
import type { Plan } from "../planner.ts";

export interface StepState {
  index: number;
  status: "pending" | "running" | "done" | "failed";
  description: string;
  model?: string;
  toolCalls: string[];
  result?: string;
}

export function AgentProgress({
  plan,
  liveStep,
  steps,
}: {
  plan: Plan;
  liveStep?: StepState;
  steps?: StepState[];
}) {
  const displaySteps = steps ?? (liveStep ? [liveStep] : plan.steps.map((s, i) => ({
    index: i,
    status: "pending" as const,
    description: s.description,
    model: undefined as string | undefined,
    toolCalls: [] as string[],
  })));

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          Executing
        </Text>
        <Text dimColor> — {plan.goal}</Text>
      </Box>

      {displaySteps.map((step) => {
        const isRunning = step.status === "running";
        const isDone = step.status === "done";
        const isFailed = step.status === "failed";

        return (
          <Box key={step.index} flexDirection="column" marginLeft={1}>
            <Box>
              {isRunning && <Text color="cyan">◉ </Text>}
              {isDone && <Text color="green">● </Text>}
              {isFailed && <Text color="red">✕ </Text>}
              {!isRunning && !isDone && !isFailed && <Text color="gray">○ </Text>}
              <Text
                color={isDone ? "green" : isRunning ? "white" : isFailed ? "red" : "gray"}
              >
                {step.description.slice(0, 70)}
                {step.model ? `  [${step.model}]` : ""}
              </Text>
            </Box>
            {step.toolCalls.map((tc, j) => (
              <Box key={j} marginLeft={3}>
                <Text dimColor>↳ {tc}</Text>
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
