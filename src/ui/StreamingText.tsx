import { Text, Box } from "ink";

interface StreamingTextProps {
  content: string;
}

export function StreamingText({ content }: StreamingTextProps) {
  return (
    <Box flexDirection="column">
      <Text>{content}</Text>
      <Text color="cyan">█</Text>
    </Box>
  );
}
