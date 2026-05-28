import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, PanResponder, Animated } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ControllerButton } from './controller-button';
import { KeyConfig } from '@/hooks/use-layout-config';

const BUTTON_SIZE = 72;
const GAP = 8;
const ROW_HEIGHT = BUTTON_SIZE + GAP;

interface KeyPanelProps {
  layoutMode?: boolean;
  keys: KeyConfig[];
  zOrder: string[];
  panelRef?: React.RefObject<View | null>;
  onMove?: (code: string, x: number, y: number) => void;
  onBringToFront?: (code: string) => void;
  onKeyDown?: (code: string) => void;
  onKeyUp?: (code: string) => void;
}

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
  minX,
  maxX,
  minY,
  maxY,
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
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}) {
  const onMoveRef = useRef(onMove);
  const onGrantRef = useRef(onGrant);
  const onReleaseRef = useRef(onRelease);
  const offsetRef = useRef({ x: offsetX, y: offsetY });
  const minXRef = useRef(minX);
  const maxXRef = useRef(maxX);
  const minYRef = useRef(minY);
  const maxYRef = useRef(maxY);

  onMoveRef.current = onMove;
  onGrantRef.current = onGrant;
  onReleaseRef.current = onRelease;
  offsetRef.current = { x: offsetX, y: offsetY };
  minXRef.current = minX;
  maxXRef.current = maxX;
  minYRef.current = minY;
  maxYRef.current = maxY;

  const dragStartOffset = useRef({ x: 0, y: 0 });

  const clampX = (v: number) => Math.max(minXRef.current, Math.min(maxXRef.current, v));
  const clampY = (v: number) => Math.max(minYRef.current, Math.min(maxYRef.current, v));

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
          x: clampX(dragStartOffset.current.x + gestureState.dx),
          y: clampY(dragStartOffset.current.y + gestureState.dy),
        });
      },
      onPanResponderRelease: (_, gesture) => {
        const newX = clampX(dragStartOffset.current.x + gesture.dx);
        const newY = clampY(dragStartOffset.current.y + gesture.dy);
        anim.setValue({ x: newX, y: newY });
        onMoveRef.current(newX, newY);
        onReleaseRef.current?.();
      },
      onPanResponderTerminate: () => {
        anim.setValue({ x: offsetRef.current.x, y: offsetRef.current.y });
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
      collapsable={false}
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

export function findEmptyGridCell(
  panelWidth: number,
  existingKeys: KeyConfig[]
): { col: number; row: number } {
  const cols = Math.max(1, Math.floor((panelWidth - 16) / (BUTTON_SIZE + GAP)));

  const occupied = new Set<string>();
  for (const key of existingKeys) {
    const actualCol = Math.round(
      (key.storedPosition.col * (BUTTON_SIZE + GAP) + key.offset.x) / (BUTTON_SIZE + GAP)
    );
    const actualRow = Math.round(
      (key.storedPosition.row * (BUTTON_SIZE + GAP) + key.offset.y) / (BUTTON_SIZE + GAP)
    );
    occupied.add(`${actualCol},${actualRow}`);
  }

  const maxScanRow = Math.max(
    Math.floor((existingKeys.length - 1) / cols) + 3,
    5
  );
  for (let row = 0; row < maxScanRow; row++) {
    for (let col = 0; col < cols; col++) {
      if (!occupied.has(`${col},${row}`)) {
        return { col, row };
      }
    }
  }

  return { col: existingKeys.length % cols, row: Math.floor(existingKeys.length / cols) };
}

export function recalculateStoredPositions(
  keys: KeyConfig[],
  panelWidth: number
): KeyConfig[] {
  const cellSize = BUTTON_SIZE + GAP;
  const cols = Math.max(1, Math.floor((panelWidth - 16) / cellSize));

  const withVisual = keys.map((k) => ({
    key: k,
    visualX: k.storedPosition.col * cellSize + k.offset.x,
    visualY: k.storedPosition.row * cellSize + k.offset.y,
    sortRow: Math.round((k.storedPosition.row * cellSize + k.offset.y) / cellSize),
    sortCol: Math.round((k.storedPosition.col * cellSize + k.offset.x) / cellSize),
  }));

  withVisual.sort((a, b) => {
    if (a.sortRow !== b.sortRow) return a.sortRow - b.sortRow;
    return a.sortCol - b.sortCol;
  });

  return withVisual.map((item, index) => {
    const newCol = index % cols;
    const newRow = Math.floor(index / cols);
    return {
      ...item.key,
      storedPosition: { col: newCol, row: newRow },
      offset: {
        x: item.visualX - newCol * cellSize,
        y: item.visualY - newRow * cellSize,
      },
    };
  });
}

function getBasePosition(key: KeyConfig) {
  return {
    top: key.storedPosition.row * ROW_HEIGHT,
    left: key.storedPosition.col * (BUTTON_SIZE + GAP),
  };
}

export function KeyPanel({ layoutMode, keys, zOrder, panelRef, onMove, onBringToFront, onKeyDown, onKeyUp }: KeyPanelProps) {
  const theme = useTheme();
  const order = useMemo(() => {
    const keyCodes = new Set(keys.map(k => k.code));
    const filtered = (zOrder ?? []).filter(c => keyCodes.has(c));
    keys.forEach(k => {
      if (!filtered.includes(k.code)) filtered.push(k.code);
    });
    return filtered;
  }, [keys, zOrder]);

  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [bgOrder, setBgOrder] = useState<string[]>(keys.map(k => k.code));
  const [containerPos, setContainerPos] = useState({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<View>(null);

  const cols = useMemo(() => {
    if (panelSize.width === 0) return 3;
    return Math.max(1, Math.floor((panelSize.width - 16) / (BUTTON_SIZE + GAP)));
  }, [panelSize.width]);

  const maxCol = useMemo(() => {
    return keys.reduce((max, k) => Math.max(max, k.storedPosition.col), 0);
  }, [keys]);

  const maxRow = useMemo(() => {
    return keys.reduce((max, k) => Math.max(max, k.storedPosition.row), 0);
  }, [keys]);

  const containerWidth = (maxCol + 1) * (BUTTON_SIZE + GAP) - GAP;
  const containerHeight = (maxRow + 1) * ROW_HEIGHT - GAP;

  const animsRef = useRef<Record<string, Animated.ValueXY>>({});
  const draggingCodeRef = useRef<string | null>(null);

  keys.forEach(key => {
    if (!animsRef.current[key.code]) {
      animsRef.current[key.code] = new Animated.ValueXY({ x: key.offset.x, y: key.offset.y });
    }
  });

  useEffect(() => {
    keys.forEach(key => {
      if (draggingCodeRef.current === key.code) return;
      const anim = animsRef.current[key.code];
      if (anim) {
        anim.setValue({ x: key.offset.x, y: key.offset.y });
      }
    });
    const currentCodes = new Set(keys.map(k => k.code));
    Object.keys(animsRef.current).forEach(code => {
      if (!currentCodes.has(code)) {
        delete animsRef.current[code];
      }
    });
  }, [keys]);

  useEffect(() => {
    setPressed(prev => {
      const next: Record<string, boolean> = {};
      keys.forEach(k => {
        next[k.code] = prev[k.code] ?? false;
      });
      return next;
    });
    setBgOrder(prev => {
      const keyCodes = new Set(keys.map(k => k.code));
      const filtered = prev.filter(c => keyCodes.has(c));
      keys.forEach(k => {
        if (!filtered.includes(k.code)) filtered.push(k.code);
      });
      return filtered;
    });
  }, [keys]);

  const handleContainerLayout = useCallback(() => {
    if (!panelRef?.current || !containerRef.current) return;
    const node = containerRef.current;
    const panel = panelRef.current;
    node.measureLayout(panel, (x, y) => {
      setContainerPos({ x, y });
    });
    panel.measure((_, __, w, h) => {
      setPanelSize((prev) => {
        if (prev.width !== w || prev.height !== h) {
          return { width: w, height: h };
        }
        return prev;
      });
    });
  }, [panelRef]);

  useEffect(() => {
    if (!layoutMode) return;
    handleContainerLayout();
  }, [layoutMode, handleContainerLayout]);

  const handlePressIn = useCallback((code: string) => {
    setPressed(p => ({ ...p, [code]: true }));
    setBgOrder(prev => {
      const rest = prev.filter(c => c !== code);
      return [...rest, code];
    });
    onKeyDown?.(code);
  }, [onKeyDown]);

  const handlePressOut = useCallback((code: string) => {
    setPressed(p => ({ ...p, [code]: false }));
    onKeyUp?.(code);
  }, [onKeyUp]);

  const renderBackground = (key: KeyConfig) => {
    const gridPos = getBasePosition(key);
    const anim = animsRef.current[key.code];
    return (
      <Animated.View
        key={`bg-${key.code}`}
        pointerEvents="none"
        collapsable={false}
        style={{
          position: 'absolute',
          top: gridPos.top,
          left: gridPos.left,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: 12,
          backgroundColor: pressed[key.code]
            ? theme.colors.primaryContainer
            : theme.colors.surfaceVariant,
          zIndex: bgOrder.indexOf(key.code),
          transform: anim ? [{ translateX: anim.x }, { translateY: anim.y }] : undefined,
        }}
      />
    );
  };

  const renderButton = (key: KeyConfig) => {
    const gridPos = getBasePosition(key);
    const zIndex = keys.length + order.indexOf(key.code);
    const button = (
      <ControllerButton
        label={key.label}
        transparent={true}
        disabled={layoutMode}
        onPressIn={() => handlePressIn(key.code)}
        onPressOut={() => handlePressOut(key.code)}
      />
    );

    if (layoutMode) {
      const cx = containerPos.x;
      const cy = containerPos.y;
      const minX = -cx - gridPos.left;
      const maxX = panelSize.width - cx - gridPos.left - BUTTON_SIZE;
      const minY = -cy - gridPos.top;
      const maxY = panelSize.height - cy - gridPos.top - BUTTON_SIZE;
      const anim = animsRef.current[key.code];
      return (
        <DraggableButtonInner
          key={key.code}
          gridTop={gridPos.top}
          gridLeft={gridPos.left}
          offsetX={key.offset.x}
          offsetY={key.offset.y}
          anim={anim ?? new Animated.ValueXY({ x: 0, y: 0 })}
          onMove={(x, y) => onMove?.(key.code, x, y)}
          onGrant={() => {
            draggingCodeRef.current = key.code;
            onBringToFront?.(key.code);
          }}
          onRelease={() => {
            draggingCodeRef.current = null;
          }}
          zIndex={zIndex}
          minX={minX}
          maxX={maxX}
          minY={minY}
          maxY={maxY}
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
        key={key.code}
        style={{
          position: 'absolute',
          top: gridPos.top,
          left: gridPos.left,
          zIndex,
          transform: [{ translateX: key.offset.x }, { translateY: key.offset.y }],
        }}
      >
        {button}
      </View>
    );
  };

  return (
    <View
      ref={containerRef}
      onLayout={handleContainerLayout}
      style={[styles.container, { width: containerWidth, height: containerHeight }]}
    >
      {keys.map((key) => renderBackground(key))}
      {keys.map((key) => renderButton(key))}
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
