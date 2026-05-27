import { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Touchpad } from './touchpad';
import { ResizeHandle } from './resize-handle';

function DragHandle({
  onDrag,
  onGrant,
  onRelease,
}: {
  onDrag: (dx: number, dy: number) => void;
  onGrant?: () => void;
  onRelease?: () => void;
}) {
  const theme = useTheme();
  const startX = useRef(0);
  const startY = useRef(0);

  return (
    <View
      style={styles.dragHandle}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        startX.current = e.nativeEvent.pageX;
        startY.current = e.nativeEvent.pageY;
        onGrant?.();
      }}
      onResponderMove={(e) => {
        const dx = e.nativeEvent.pageX - startX.current;
        const dy = e.nativeEvent.pageY - startY.current;
        startX.current = e.nativeEvent.pageX;
        startY.current = e.nativeEvent.pageY;
        onDrag(dx, dy);
      }}
      onResponderRelease={onRelease}
      onResponderTerminate={onRelease}
    >
      <MaterialCommunityIcons name="cursor-move" size={24} color={theme.colors.primary} />
    </View>
  );
}

interface Insets {
  touchpadTop: number;
  touchpadBottom: number;
  touchpadLeft: number;
  touchpadRight: number;
}

interface TouchpadContainerProps {
  layoutMode: boolean;
  insets: Insets;
  defaultInsets: Insets;
  winW: number;
  winH: number;
  onChange: (next: Insets) => void;
}

export function TouchpadContainer({
  layoutMode,
  insets,
  defaultInsets,
  winW,
  winH,
  onChange,
}: TouchpadContainerProps) {
  const theme = useTheme();
  const viewRef = useRef<View>(null);
  const insetsRef = useRef(insets);
  const draggingRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);

  const applyInsets = (next: Insets) => {
    const node = viewRef.current;
    if (!node) return;
    node.setNativeProps({
      style: {
        top: next.touchpadTop,
        bottom: next.touchpadBottom,
        left: next.touchpadLeft,
        right: next.touchpadRight,
      },
    });
  };

  useEffect(() => {
    if (draggingRef.current) return;
    insetsRef.current = insets;
    applyInsets(insets);
  }, [insets]);

  const updateEdge = (
    key: keyof Insets,
    delta: number,
    maxFn: (prev: Insets) => number
  ) => {
    const prev = insetsRef.current;
    const next = {
      ...prev,
      [key]: Math.max(defaultInsets[key], Math.min(maxFn(prev), prev[key] + delta)),
    };
    insetsRef.current = next;
    applyInsets(next);
  };

  const updatePosition = (dx: number, dy: number) => {
    const prev = insetsRef.current;
    const clampedDx = Math.max(
      defaultInsets.touchpadLeft - prev.touchpadLeft,
      Math.min(prev.touchpadRight - defaultInsets.touchpadRight, dx)
    );
    const clampedDy = Math.max(
      defaultInsets.touchpadTop - prev.touchpadTop,
      Math.min(prev.touchpadBottom - defaultInsets.touchpadBottom, dy)
    );
    const next = {
      ...prev,
      touchpadLeft: prev.touchpadLeft + clampedDx,
      touchpadRight: prev.touchpadRight - clampedDx,
      touchpadTop: prev.touchpadTop + clampedDy,
      touchpadBottom: prev.touchpadBottom - clampedDy,
    };
    insetsRef.current = next;
    applyInsets(next);
  };

  const handleRelease = () => {
    draggingRef.current = false;
    onChange(insetsRef.current);
  };

  return (
    <View
      ref={viewRef}
      style={[
        styles.wrapper,
        {
          top: insets.touchpadTop,
          bottom: insets.touchpadBottom,
          left: insets.touchpadLeft,
          right: insets.touchpadRight,
        },
      ]}
    >
      {layoutMode && (
        <>
          <ResizeHandle
            edge="top"
            onGrant={() => { draggingRef.current = true; }}
            onResize={(_, dy) =>
              updateEdge('touchpadTop', dy, (prev) => winH - prev.touchpadBottom - 100)
            }
            onRelease={handleRelease}
          />
          <ResizeHandle
            edge="bottom"
            onGrant={() => { draggingRef.current = true; }}
            onResize={(_, dy) =>
              updateEdge('touchpadBottom', -dy, (prev) => winH - prev.touchpadTop - 100)
            }
            onRelease={handleRelease}
          />
          <ResizeHandle
            edge="left"
            onGrant={() => { draggingRef.current = true; }}
            onResize={(dx) =>
              updateEdge('touchpadLeft', dx, (prev) => Math.floor(winW / 2) - prev.touchpadRight - 100)
            }
            onRelease={handleRelease}
          />
          <ResizeHandle
            edge="right"
            onGrant={() => { draggingRef.current = true; }}
            onResize={(dx) =>
              updateEdge('touchpadRight', -dx, (prev) => Math.floor(winW / 2) - prev.touchpadLeft - 100)
            }
            onRelease={handleRelease}
          />
        </>
      )}
      <View
        style={styles.touchpadWrapper}
        onStartShouldSetResponder={layoutMode ? () => true : () => false}
        onMoveShouldSetResponder={layoutMode ? () => true : () => false}
        onResponderGrant={layoutMode ? (e) => {
          dragStartX.current = e.nativeEvent.pageX;
          dragStartY.current = e.nativeEvent.pageY;
          draggingRef.current = true;
        } : undefined}
        onResponderMove={layoutMode ? (e) => {
          const dx = e.nativeEvent.pageX - dragStartX.current;
          const dy = e.nativeEvent.pageY - dragStartY.current;
          dragStartX.current = e.nativeEvent.pageX;
          dragStartY.current = e.nativeEvent.pageY;
          updatePosition(dx, dy);
        } : undefined}
        onResponderRelease={layoutMode ? handleRelease : undefined}
        onResponderTerminate={layoutMode ? handleRelease : undefined}
      >
        <Touchpad
          disabled={layoutMode}
          onTouchStart={(x, y) => console.log('Touch start:', x, y)}
          onTouchMove={(x, y) => console.log('Touch move:', x, y)}
          onTouchEnd={() => console.log('Touch end')}
        />
      </View>
      {layoutMode && (
        <View style={styles.dragHandle}>
          <MaterialCommunityIcons name="cursor-move" size={24} color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    overflow: 'visible',
  },
  touchpadWrapper: {
    flex: 1,
  },
  dragHandle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -16,
    marginLeft: -16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    pointerEvents: 'none',
  },
});
