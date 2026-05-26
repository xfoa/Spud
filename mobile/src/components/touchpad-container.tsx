import { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Touchpad } from './touchpad';
import { ResizeHandle } from './resize-handle';

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
  const viewRef = useRef<View>(null);
  const insetsRef = useRef(insets);
  const draggingRef = useRef(false);

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
      <Touchpad
        onTouchStart={(x, y) => console.log('Touch start:', x, y)}
        onTouchMove={(x, y) => console.log('Touch move:', x, y)}
        onTouchEnd={() => console.log('Touch end')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    overflow: 'visible',
  },
});
