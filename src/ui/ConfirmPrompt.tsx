import { useState } from "react";
import { Text, Box, useInput } from "ink";

export function ConfirmPrompt({ onConfirm, onReject }: { onConfirm: () => void; onReject: () => void }) {
  const [selected, setSelected] = useState<"y" | "n">("y");

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow) {
      setSelected((s) => (s === "y" ? "n" : "y"));
    }
    if (key.return) {
      if (selected === "y") onConfirm();
      else onReject();
    }
    if (input === "y") onConfirm();
    if (input === "n") onReject();
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>Accept this plan?</Text>
      <Box marginTop={1}>
        <Box marginRight={2}>
          <Text color={selected === "y" ? "green" : undefined} inverse={selected === "y"}>
            {" [Y] Yes "}
          </Text>
        </Box>
        <Box>
          <Text color={selected === "n" ? "red" : undefined} inverse={selected === "n"}>
            {" [N] No  "}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>← → to switch · Enter to confirm · y/n keys also work</Text>
      </Box>
    </Box>
  );
}
