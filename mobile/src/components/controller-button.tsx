import { useState, useCallback } from 'react';
import { View, StyleSheet, GestureResponderEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface ControllerButtonProps {
  label: string;
  transparent?: boolean;
  disabled?: boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
}

export function ControllerButton({ label, transparent, disabled, onPressIn, onPressOut }: ControllerButtonProps) {
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

  const isPressed = pressed && !disabled;

  return (
    <View
      style={[
        styles.button,
        {
          backgroundColor: transparent
            ? 'transparent'
            : isPressed
              ? theme.colors.primaryContainer
              : theme.colors.surfaceVariant,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
      onTouchStart={disabled ? undefined : handleTouchStart}
      onTouchEnd={disabled ? undefined : handleTouchEnd}
      onTouchCancel={disabled ? undefined : handleTouchEnd}
    >
      <Text
        variant="titleLarge"
        style={[
          styles.label,
          { color: isPressed ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant },
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
