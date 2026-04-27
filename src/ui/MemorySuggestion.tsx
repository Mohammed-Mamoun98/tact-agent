import { Text, Box, useInput } from "ink";
import { useState } from "react";

interface Props {
  suggestion: string;
  onSave: () => void;
  onDismiss: () => void;
}

export function MemorySuggestion({ suggestion, onSave, onDismiss }: Props) {
  const [selected, setSelected] = useState<"save" | "dismiss">("dismiss");

  useInput((_input, key) => {
    if (key.leftArrow) setSelected("save");
    if (key.rightArrow) setSelected("dismiss");
    if (key.return) {
      if (selected === "save") onSave();
      else onDismiss();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" padding={1} marginY={1}>
      <Text bold color="magenta">
        Learn from this?
      </Text>
      <Box marginY={1}>
        <Text>{suggestion}</Text>
      </Box>
      <Box>
        <Box marginRight={2}>
          <Text color={selected === "save" ? "green" : undefined} inverse={selected === "save"}>
            {" [S] Save to memory "}
          </Text>
        </Box>
        <Box>
          <Text color={selected === "dismiss" ? "gray" : undefined} inverse={selected === "dismiss"}>
            {" [D] Dismiss       "}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
