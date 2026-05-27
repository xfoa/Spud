import { useRef, useCallback } from 'react';
import { Animated, PanResponder, StyleSheet, ViewStyle } from 'react-native';

interface DraggableButtonProps {
  children: React.ReactNode;
  offsetX: number;
  offsetY: number;
  onMove: (dx: number, dy: number) => void;
  onGrant?: () => void;
  onRelease?: () => void;
  style?: ViewStyle;
  zIndex?: number;
}

export function DraggableButton({ children, offsetX, offsetY, onMove, onGrant, onRelease, style, zIndex }: DraggableButtonProps) {
  const position = useRef(new Animated.ValueXY({ x: offsetX, y: offsetY })).current;
  const startOffset = useRef({ x: offsetX, y: offsetY });
  const onMoveRef = useRef(onMove);
  const onGrantRef = useRef(onGrant);
  const onReleaseRef = useRef(onRelease);

  onMoveRef.current = onMove;
  onGrantRef.current = onGrant;
  onReleaseRef.current = onRelease;

  // Sync position when offset props change (e.g., after reset)
  const prevOffsetKey = useRef('');
  const offsetKey = `${offsetX},${offsetY}`;
  if (offsetKey !== prevOffsetKey.current) {
    prevOffsetKey.current = offsetKey;
    position.setValue({ x: offsetX, y: offsetY });
  }

  const panHandlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startOffset.current = { x: offsetX, y: offsetY };
        onGrantRef.current?.();
      },
      onPanResponderMove: (_, gesture) => {
        position.setValue({
          x: startOffset.current.x + gesture.dx,
          y: startOffset.current.y + gesture.dy,
        });
      },
      onPanResponderRelease: (_, gesture) => {
        const newX = startOffset.current.x + gesture.dx;
        const newY = startOffset.current.y + gesture.dy;
        position.setValue({ x: newX, y: newY });
        onMoveRef.current(newX, newY);
        onReleaseRef.current?.();
      },
    })
  ).current;

  const translate = position.getTranslateTransform();

  return (
    <Animated.View style={[styles.wrapper, { transform: translate }, style, zIndex !== undefined && { zIndex }]} {...panHandlers.panHandlers}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
});
