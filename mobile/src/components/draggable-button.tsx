import { useMemo, useEffect, useCallback } from 'react';
import { Animated, PanResponder, StyleSheet } from 'react-native';

interface DraggableButtonProps {
  children: React.ReactNode;
  offsetX: number;
  offsetY: number;
  onMove: (dx: number, dy: number) => void;
}

export function DraggableButton({ children, offsetX, offsetY, onMove }: DraggableButtonProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const position = useMemo(() => new Animated.ValueXY({ x: offsetX, y: offsetY }), []);
  const layout = useMemo(() => position.getLayout(), [position]);

  useEffect(() => {
    position.setValue({ x: offsetX, y: offsetY });
  }, [offsetX, offsetY, position]);

  const handleRelease = useCallback(
    (dx: number, dy: number) => {
      onMove(dx + offsetX, dy + offsetY);
    },
    [onMove, offsetX, offsetY]
  );

  const panHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          position.extractOffset();
        },
        onPanResponderMove: (_, gesture) => {
          position.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: (_, gesture) => {
          position.extractOffset();
          handleRelease(gesture.dx, gesture.dy);
        },
      }),
    [position, handleRelease]
  );

  return (
    <Animated.View style={[styles.wrapper, layout]} {...panHandlers.panHandlers}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
  },
});
