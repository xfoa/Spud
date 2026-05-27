import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, PanResponder, Animated } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  anim,
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
  anim: Animated.ValueXY;
  onMove: (x: number, y: number) => void;
  onGrant?: () => void;
  onRelease?: () => void;
  zIndex: number;
}) {
  const onMoveRef = useRef(onMove);
  const onGrantRef = useRef(onGrant);
  const onReleaseRef = useRef(onRelease);
  const offsetRef = useRef({ x: offsetX, y: offsetY });

  onMoveRef.current = onMove;
  onGrantRef.current = onGrant;
  onReleaseRef.current = onRelease;
  offsetRef.current = { x: offsetX, y: offsetY };

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
  const theme = useTheme();
  const off = useMemo(() => offsets ?? { w: { x: 0, y: 0 }, a: { x: 0, y: 0 }, s: { x: 0, y: 0 }, d: { x: 0, y: 0 } }, [offsets]);
  const order = zOrder ?? ['w', 'a', 's', 'd'];

  const [pressed, setPressed] = useState<Record<'w' | 'a' | 's' | 'd', boolean>>({
    w: false, a: false, s: false, d: false,
  });
  const [bgOrder, setBgOrder] = useState<('w' | 'a' | 's' | 'd')[]>(['w', 'a', 's', 'd']);

  const containerWidth = (BUTTON_SIZE + GAP) * 3 - GAP;
  const containerHeight = ROW_HEIGHT * 2 - GAP;

  const anims = useRef<Record<'w' | 'a' | 's' | 'd', Animated.ValueXY>>({
    w: new Animated.ValueXY({ x: off.w.x, y: off.w.y }),
    a: new Animated.ValueXY({ x: off.a.x, y: off.a.y }),
    s: new Animated.ValueXY({ x: off.s.x, y: off.s.y }),
    d: new Animated.ValueXY({ x: off.d.x, y: off.d.y }),
  }).current;

  useEffect(() => {
    anims.w.setValue({ x: off.w.x, y: off.w.y });
    anims.a.setValue({ x: off.a.x, y: off.a.y });
    anims.s.setValue({ x: off.s.x, y: off.s.y });
    anims.d.setValue({ x: off.d.x, y: off.d.y });
  }, [off, anims]);

  const handlePressIn = useCallback((key: 'w' | 'a' | 's' | 'd') => {
    setPressed((p) => ({ ...p, [key]: true }));
    setBgOrder((prev) => {
      const rest = prev.filter((k) => k !== key);
      return [...rest, key];
    });
    onKeyDown?.(key);
  }, [onKeyDown]);

  const handlePressOut = useCallback((key: 'w' | 'a' | 's' | 'd') => {
    setPressed((p) => ({ ...p, [key]: false }));
    onKeyUp?.(key);
  }, [onKeyUp]);

  const renderBackground = (key: 'w' | 'a' | 's' | 'd') => {
    const gridPos = GRID_POSITIONS[key];
    return (
      <Animated.View
        key={`bg-${key}`}
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: gridPos.top,
          left: gridPos.left,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: 12,
          backgroundColor: pressed[key]
            ? theme.colors.primaryContainer
            : theme.colors.surfaceVariant,
          zIndex: bgOrder.indexOf(key),
          transform: [{ translateX: anims[key].x }, { translateY: anims[key].y }],
        }}
      />
    );
  };

  const renderButton = (key: 'w' | 'a' | 's' | 'd', label: string) => {
    const gridPos = GRID_POSITIONS[key];
    const zIndex = 10 + order.indexOf(key);
    const button = (
      <ControllerButton
        label={label}
        transparent={true}
        disabled={layoutMode}
        onPressIn={() => handlePressIn(key)}
        onPressOut={() => handlePressOut(key)}
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
          anim={anims[key]}
          onMove={(x, y) => onMove?.(key, x, y)}
          onGrant={() => onBringToFront?.(key)}
          onRelease={() => {}}
          zIndex={zIndex}
        >
          {button}
          <View style={styles.dragIndicator} pointerEvents="none">
            <MaterialCommunityIcons name="cursor-move" size={16} color={theme.colors.primary} />
          </View>
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
      {renderBackground('w')}
      {renderBackground('a')}
      {renderBackground('s')}
      {renderBackground('d')}
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
  dragIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
