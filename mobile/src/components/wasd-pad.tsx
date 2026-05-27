import { useRef, useEffect } from 'react';
import { View, StyleSheet, PanResponder, Animated } from 'react-native';
import { ControllerButton } from './controller-button';
import { ButtonOffset } from '@/hooks/use-layout-config';

const BUTTON_SIZE = 72;
const GAP = 8;
const ROW_HEIGHT = BUTTON_SIZE + GAP;

interface WasdPadProps {
  layoutMode?: boolean;
  offsets?: { w: ButtonOffset; a: ButtonOffset; s: ButtonOffset; d: ButtonOffset };
  zOrder?: ('w' | 'a' | 's' | 'd')[];
  onMove?: (key: 'w' | 'a' | 's' | 'd', x: number, y: number) => void;
  onBringToFront?: (key: 'w' | 'a' | 's' | 'd') => void;
  onKeyDown?: (key: string) => void;
  onKeyUp?: (key: string) => void;
}

const GRID_POSITIONS: Record<'w' | 'a' | 's' | 'd', { top: number; left: number }> = {
  w: { top: 0, left: BUTTON_SIZE + GAP },
  a: { top: ROW_HEIGHT, left: 0 },
  s: { top: ROW_HEIGHT, left: BUTTON_SIZE + GAP },
  d: { top: ROW_HEIGHT, left: (BUTTON_SIZE + GAP) * 2 },
};

function DraggableButtonInner({
  children,
  gridTop,
  gridLeft,
  offsetX,
  offsetY,
  onMove,
  onGrant,
  onRelease,
  zIndex,
}: {
  children: React.ReactNode;
  gridTop: number;
  gridLeft: number;
  offsetX: number;
  offsetY: number;
  onMove: (x: number, y: number) => void;
  onGrant?: () => void;
  onRelease?: () => void;
  zIndex: number;
}) {
  const anim = useRef(new Animated.ValueXY({ x: offsetX, y: offsetY })).current;
  const onMoveRef = useRef(onMove);
  const onGrantRef = useRef(onGrant);
  const onReleaseRef = useRef(onRelease);
  const offsetRef = useRef({ x: offsetX, y: offsetY });

  onMoveRef.current = onMove;
  onGrantRef.current = onGrant;
  onReleaseRef.current = onRelease;
  offsetRef.current = { x: offsetX, y: offsetY };

  // Sync when offset props change from outside (e.g., reset)
  useEffect(() => {
    anim.setValue({ x: offsetX, y: offsetY });
  }, [offsetX, offsetY, anim]);

  const dragStartOffset = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartOffset.current = { ...offsetRef.current };
        onGrantRef.current?.();
      },
      onPanResponderMove: (_, gestureState) => {
        anim.setValue({
          x: dragStartOffset.current.x + gestureState.dx,
          y: dragStartOffset.current.y + gestureState.dy,
        });
      },
      onPanResponderRelease: (_, gesture) => {
        const newX = dragStartOffset.current.x + gesture.dx;
        const newY = dragStartOffset.current.y + gesture.dy;
        anim.setValue({ x: newX, y: newY });
        onMoveRef.current(newX, newY);
        onReleaseRef.current?.();
      },
    })
  ).current;

  const translate = [
    { translateX: anim.x },
    { translateY: anim.y },
  ];

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: gridTop,
        left: gridLeft,
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        zIndex,
        transform: translate,
      }}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

export function WasdPad({ layoutMode, offsets, zOrder, onMove, onBringToFront, onKeyDown, onKeyUp }: WasdPadProps) {
  const off = offsets ?? { w: { x: 0, y: 0 }, a: { x: 0, y: 0 }, s: { x: 0, y: 0 }, d: { x: 0, y: 0 } };
  const order = zOrder ?? ['w', 'a', 's', 'd'];

  const containerWidth = (BUTTON_SIZE + GAP) * 3 - GAP;
  const containerHeight = ROW_HEIGHT * 2 - GAP;

  const renderButton = (key: 'w' | 'a' | 's' | 'd', label: string) => {
    const gridPos = GRID_POSITIONS[key];
    const zIndex = order.indexOf(key);
    const button = (
      <ControllerButton
        label={label}
        onPressIn={() => onKeyDown?.(key)}
        onPressOut={() => onKeyUp?.(key)}
      />
    );

    if (layoutMode) {
      return (
        <DraggableButtonInner
          key={key}
          gridTop={gridPos.top}
          gridLeft={gridPos.left}
          offsetX={off[key].x}
          offsetY={off[key].y}
          onMove={(x, y) => onMove?.(key, x, y)}
          onGrant={() => onBringToFront?.(key)}
          onRelease={() => {}}
          zIndex={zIndex}
        >
          {button}
        </DraggableButtonInner>
      );
    }

    return (
      <View
        key={key}
        style={{
          position: 'absolute',
          top: gridPos.top,
          left: gridPos.left,
          zIndex,
          transform: [{ translateX: off[key].x }, { translateY: off[key].y }],
        }}
      >
        {button}
      </View>
    );
  };

  return (
    <View style={[styles.container, { width: containerWidth, height: containerHeight }]}>
      {renderButton('w', 'W')}
      {renderButton('a', 'A')}
      {renderButton('s', 'S')}
      {renderButton('d', 'D')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
