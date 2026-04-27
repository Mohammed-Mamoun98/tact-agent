import { Text, Box } from "ink";
import type { Plan } from "../planner.ts";

const CATEGORY_COLORS: Record<string, string> = {
  simple: "green",
  planning: "cyan",
  debugging: "yellow",
  feature_creation: "magenta",
  refactoring: "blue",
  vision: "red",
};

const COMPLEXITY_BARS: Record<string, string> = {
  low: "▌",
  mid: "▌▌",
  high: "▌▌▌",
};

export function PlanView({ plan }: { plan: Plan }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        Goal: {plan.goal}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {plan.steps.map((step) => (
          <Box key={step.id} marginLeft={1}>
            <Text color="white">{step.id}. </Text>
            <Text color="yellow">[{step.tool}]</Text>
            <Text> {step.description} </Text>
            <Text color={CATEGORY_COLORS[step.category] ?? "white"}>
              [{step.category}
            </Text>
            <Text dimColor> / </Text>
            <Text color={step.complexity === "high" ? "red" : step.complexity === "mid" ? "yellow" : "green"}>
              {COMPLEXITY_BARS[step.complexity]} {step.complexity}]
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
