import { useState, useCallback } from 'react';
import { View, StyleSheet, GestureResponderEvent } from 'react-native';
import { Surface, useTheme } from 'react-native-paper';

interface TouchpadProps {
  onTouchStart?: (x: number, y: number) => void;
  onTouchMove?: (x: number, y: number) => void;
  onTouchEnd?: () => void;
}

export function Touchpad({ onTouchStart, onTouchMove, onTouchEnd }: TouchpadProps) {
  const theme = useTheme();
  const [touchPosition, setTouchPosition] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    setTouchPosition({ x: locationX, y: locationY });
    onTouchStart?.(locationX, locationY);
  }, [onTouchStart]);

  const handleTouchMove = useCallback((event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    setTouchPosition({ x: locationX, y: locationY });
    onTouchMove?.(locationX, locationY);
  }, [onTouchMove]);

  const handleTouchEnd = useCallback(() => {
    setTouchPosition(null);
    onTouchEnd?.();
  }, [onTouchEnd]);

  return (
    <Surface style={[styles.container, { backgroundColor: theme.colors.surfaceVariant }]} elevation={2}>
      <View
        style={styles.touchArea}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
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

        {touchPosition && (
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
