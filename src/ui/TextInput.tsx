import { useEffect, useRef } from "react";
import { Text, Box, useStdin } from "ink";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function TextInput({ value, onChange, onSubmit, onCancel, disabled, placeholder }: TextInputProps) {
  const { stdin, setRawMode } = useStdin();
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (disabled) return;
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [disabled, setRawMode]);

  useEffect(() => {
    if (disabled) return;

    const handleData = (data: Buffer) => {
      const str = data.toString();

      // Enter
      if (str === "\r" || str === "\n") {
        onSubmit();
        return;
      }

      // Backspace / Delete
      if (str === "\x7f" || str === "\b") {
        const current = valueRef.current;
        if (current.length > 0) {
          onChange(current.slice(0, -1));
        }
        return;
      }

      // Ctrl+C
      if (str === "\x03") {
        process.exit(0);
        return;
      }

      // Escape
      if (str === "\x1b") {
        onCancel?.();
        return;
      }

      // Skip ANSI escape sequences (arrow keys, etc.)
      if (str.startsWith("\x1b[")) {
        return;
      }

      // Regular text input or paste
      const current = valueRef.current;
      onChange(current + str);
    };

    stdin.on("data", handleData);
    return () => {
      stdin.off("data", handleData);
    };
  }, [stdin, onChange, onSubmit, onCancel, disabled]);

  return (
    <Box>
      <Text color="yellow">{"> "}</Text>
      <Text>{value || <Text dimColor>{placeholder}</Text>}</Text>
      <Text dimColor>█</Text>
    </Box>
  );
}
