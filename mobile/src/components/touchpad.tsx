import { useState, useCallback } from 'react';
import { View, StyleSheet, GestureResponderEvent } from 'react-native';
import { Surface, useTheme } from 'react-native-paper';

interface TouchpadProps {
  disabled?: boolean;
  onTouchStart?: (x: number, y: number) => void;
  onTouchMove?: (x: number, y: number) => void;
  onTouchEnd?: () => void;
}

export function Touchpad({ disabled, onTouchStart, onTouchMove, onTouchEnd }: TouchpadProps) {
  const theme = useTheme();
  const [touchPosition, setTouchPosition] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    if (disabled) return;
    const { locationX, locationY } = event.nativeEvent;
    setTouchPosition({ x: locationX, y: locationY });
    onTouchStart?.(locationX, locationY);
  }, [disabled, onTouchStart]);

  const handleTouchMove = useCallback((event: GestureResponderEvent) => {
    if (disabled) return;
    const { locationX, locationY } = event.nativeEvent;
    setTouchPosition({ x: locationX, y: locationY });
    onTouchMove?.(locationX, locationY);
  }, [disabled, onTouchMove]);

  const handleTouchEnd = useCallback(() => {
    if (disabled) return;
    setTouchPosition(null);
    onTouchEnd?.();
  }, [disabled, onTouchEnd]);

  return (
    <Surface
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceVariant,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      elevation={2}
    >
      <View
        style={styles.touchArea}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={handleTouchStart}
        onResponderMove={handleTouchMove}
        onResponderRelease={handleTouchEnd}
        onResponderTerminate={handleTouchEnd}
      >
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, row) => (
            <View key={`row-${row}`} style={styles.gridRow}>
              {Array.from({ length: 4 }).map((_, col) => (
                <View
                  key={`dot-${row}-${col}`}
                  style={[
                    styles.dot,
                    { backgroundColor: theme.colors.outlineVariant },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>

        {touchPosition && !disabled && (
          <View
            style={[
              styles.touchIndicator,
              {
                left: touchPosition.x - 24,
                top: touchPosition.y - 24,
                backgroundColor: theme.colors.primary,
              },
            ]}
          />
        )}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  touchArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 32,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  touchIndicator: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    opacity: 0.3,
  },
});
