import { useState, useCallback } from 'react';
import { View, StyleSheet, GestureResponderEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface ControllerButtonProps {
  label: string;
  onPressIn?: () => void;
  onPressOut?: () => void;
}

export function ControllerButton({ label, onPressIn, onPressOut }: ControllerButtonProps) {
  const theme = useTheme();
  const [pressed, setPressed] = useState(false);

  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
    setPressed(true);
    onPressIn?.();
  }, [onPressIn]);

  const handleTouchEnd = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
    setPressed(false);
    onPressOut?.();
  }, [onPressOut]);

  return (
    <View
      style={[
        styles.button,
        {
          backgroundColor: pressed
            ? theme.colors.primaryContainer
            : theme.colors.surfaceVariant,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <Text
        variant="titleLarge"
        style={[
          styles.label,
          { color: pressed ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontWeight: '600',
  },
});
