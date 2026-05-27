import React, { useRef, useEffect, useCallback } from 'react';
import { View, Animated, PanResponder, StyleSheet } from 'react-native';

const DRAG_THRESHOLD = 10;

interface PannableViewportProps {
  children: React.ReactNode;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  onTap: (x: number, y: number) => void;
  initialOffsetX?: number;
  initialOffsetY?: number;
  resetTrigger?: number;
  lockY?: boolean;
}

export function PannableViewport({
  children,
  contentWidth,
  contentHeight,
  viewportWidth,
  viewportHeight,
  onTap,
  initialOffsetX = 0,
  initialOffsetY = 0,
  resetTrigger = 0,
  lockY = false,
}: PannableViewportProps) {
  const pan = useRef(new Animated.ValueXY({ x: initialOffsetX, y: initialOffsetY })).current;
  const offsetRef = useRef({ x: initialOffsetX, y: initialOffsetY });
  const gestureStartOffsetRef = useRef({ x: initialOffsetX, y: initialOffsetY });
  const isDraggingRef = useRef(false);
  const tapStartRef = useRef({ x: 0, y: 0 });
  const viewRef = useRef<View>(null);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const contentWidthRef = useRef(contentWidth);
  contentWidthRef.current = contentWidth;
  const contentHeightRef = useRef(contentHeight);
  contentHeightRef.current = contentHeight;
  const viewportWidthRef = useRef(viewportWidth);
  viewportWidthRef.current = viewportWidth;
  const viewportHeightRef = useRef(viewportHeight);
  viewportHeightRef.current = viewportHeight;
  const lockYRef = useRef(lockY);
  lockYRef.current = lockY;

  const getClampedOffset = useCallback(
    (x: number, y: number) => {
      const maxX = Math.min(0, viewportWidthRef.current - contentWidthRef.current);
      const maxY = Math.min(0, viewportHeightRef.current - contentHeightRef.current);
      return {
        x: Math.max(maxX, Math.min(0, x)),
        y: lockYRef.current ? 0 : Math.max(maxY, Math.min(0, y)),
      };
    },
    []
  );

  useEffect(() => {
    const clamped = getClampedOffset(initialOffsetX, initialOffsetY);
    offsetRef.current = clamped;
    pan.setValue(clamped);
  }, [resetTrigger, initialOffsetX, initialOffsetY, getClampedOffset, pan]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        isDraggingRef.current = false;
        const { locationX, locationY } = e.nativeEvent;
        tapStartRef.current = { x: locationX, y: locationY };
        gestureStartOffsetRef.current = { ...offsetRef.current };
      },
      onPanResponderMove: (_, gesture) => {
        if (!isDraggingRef.current) {
          if (
            Math.abs(gesture.dx) > DRAG_THRESHOLD ||
            (!lockYRef.current && Math.abs(gesture.dy) > DRAG_THRESHOLD)
          ) {
            isDraggingRef.current = true;
          }
        }
        if (isDraggingRef.current) {
          const next = getClampedOffset(
            gestureStartOffsetRef.current.x + gesture.dx,
            gestureStartOffsetRef.current.y + gesture.dy
          );
          offsetRef.current = next;
          pan.setValue(next);
        }
      },
      onPanResponderRelease: () => {
        if (!isDraggingRef.current) {
          const contentX = tapStartRef.current.x - offsetRef.current.x;
          const contentY = tapStartRef.current.y - offsetRef.current.y;
          onTapRef.current(contentX, contentY);
        }
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        pan.setValue({ x: offsetRef.current.x, y: offsetRef.current.y });
      },
    })
  ).current;

  return (
    <View
      ref={viewRef}
      style={[styles.viewport, { width: viewportWidth, height: viewportHeight }]}
      {...panResponder.panHandlers}
    >
      <Animated.View
        style={[
          styles.content,
          {
            width: contentWidth,
            height: contentHeight,
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
  },
  content: {
    position: 'absolute',
  },
});
