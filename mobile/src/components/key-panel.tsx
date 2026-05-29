import {
  useRef,
  useMemo,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from 'react';
import { View, StyleSheet, PanResponder, Animated, Easing } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ControllerButton } from './controller-button';
import { KeyConfig } from '@/hooks/use-layout-config';

const BUTTON_SIZE = 72;
const GAP = 8;
const CELL_SIZE = BUTTON_SIZE + GAP;
const SNAP_RESOLUTION = 2;
const SNAP_STEP = CELL_SIZE / SNAP_RESOLUTION;
const PANEL_COLS = 6;
const PANEL_ROWS = 4;
const PANEL_WIDTH = PANEL_COLS * CELL_SIZE - GAP;
const PANEL_HEIGHT = PANEL_ROWS * CELL_SIZE - GAP;
const TIER1_CAPACITY = PANEL_COLS * PANEL_ROWS;
const TIER2_COLS = Math.floor((PANEL_COLS * SNAP_RESOLUTION - 1) / 4) + 1;
const TIER2_ROWS = Math.floor((PANEL_ROWS * SNAP_RESOLUTION - 1) / 4) + 1;
const TIER2_CAPACITY = TIER2_COLS * TIER2_ROWS;
const MAX_CAPACITY = TIER1_CAPACITY + TIER2_CAPACITY;

interface KeyPanelProps {
  layoutMode?: boolean;
  committedKeys: KeyConfig[];
  committedZOrder: string[];
  onKeyDown?: (code: string) => void;
  onKeyUp?: (code: string) => void;
  onKeysChange?: (keys: KeyConfig[]) => void;
}

export interface KeyPanelRef {
  getKeys(): KeyConfig[];
  getZOrder(): string[];
  addKey(code: string, label: string): void;
  removeKey(code: string): void;
  canAddKey(): boolean;
  startAlignment(): void;
  resetToCommitted(): void;
  resetEverything(): void;
}

function snapPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / SNAP_STEP) * SNAP_STEP,
    y: Math.round(y / SNAP_STEP) * SNAP_STEP,
  };
}

function findEmptyCell(
  existingKeys: { visualPosition: { x: number; y: number } }[]
): { x: number; y: number } | null {
  const occupied = new Set<string>();
  for (const k of existingKeys) {
    const s = snapPosition(k.visualPosition.x, k.visualPosition.y);
    occupied.add(`${s.x},${s.y}`);
  }

  for (let row = 0; row < PANEL_ROWS; row++) {
    for (let col = 0; col < PANEL_COLS; col++) {
      const x = col * CELL_SIZE;
      const y = row * CELL_SIZE;
      if (!occupied.has(`${x},${y}`)) {
        return { x, y };
      }
    }
  }

  for (let row = 0; row < PANEL_ROWS * SNAP_RESOLUTION; row += 4) {
    for (let col = 0; col < PANEL_COLS * SNAP_RESOLUTION; col += 4) {
      const x = col * SNAP_STEP + SNAP_STEP;
      const y = row * SNAP_STEP + SNAP_STEP;
      if (x + BUTTON_SIZE > PANEL_WIDTH || y + BUTTON_SIZE > PANEL_HEIGHT) continue;
      if (!occupied.has(`${x},${y}`)) {
        return { x, y };
      }
    }
  }

  return null;
}

function computeAlignmentTargets(
  keys: KeyConfig[]
): { code: string; targetX: number; targetY: number }[] {
  const sorted = [...keys].sort((a, b) => {
    if (a.visualPosition.y !== b.visualPosition.y) {
      return a.visualPosition.y - b.visualPosition.y;
    }
    return a.visualPosition.x - b.visualPosition.x;
  });

  const occupied = new Set<string>();
  const targets: { code: string; targetX: number; targetY: number }[] = [];

  for (const key of sorted) {
    const snapped = snapPosition(key.visualPosition.x, key.visualPosition.y);
    let { x, y } = snapped;

    if (occupied.has(`${x},${y}`)) {
      const candidates: { x: number; y: number; dist: number }[] = [];
      for (let row = 0; row < PANEL_ROWS * SNAP_RESOLUTION; row++) {
        for (let col = 0; col < PANEL_COLS * SNAP_RESOLUTION; col++) {
          const cx = col * SNAP_STEP;
          const cy = row * SNAP_STEP;
          if (cx + BUTTON_SIZE > PANEL_WIDTH || cy + BUTTON_SIZE > PANEL_HEIGHT) continue;
          if (!occupied.has(`${cx},${cy}`)) {
            const dist = Math.hypot(cx - snapped.x, cy - snapped.y);
            candidates.push({ x: cx, y: cy, dist });
          }
        }
      }
      candidates.sort((a, b) => a.dist - b.dist);
      if (candidates.length > 0) {
        x = candidates[0].x;
        y = candidates[0].y;
      }
    }

    occupied.add(`${x},${y}`);
    targets.push({ code: key.code, targetX: x, targetY: y });
  }

  return targets;
}

function clampToPanel(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(PANEL_WIDTH - BUTTON_SIZE, x)),
    y: Math.max(0, Math.min(PANEL_HEIGHT - BUTTON_SIZE, y)),
  };
}

export const KeyPanel = forwardRef<KeyPanelRef, KeyPanelProps>(function KeyPanel(
  { layoutMode, committedKeys, committedZOrder, onKeyDown, onKeyUp, onKeysChange },
  ref
) {
  const theme = useTheme();

  const [keys, setKeys] = useState<KeyConfig[]>(committedKeys);
  const [zOrder, setZOrder] = useState<string[]>(committedZOrder);
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [, setIsAligning] = useState(false);

  useEffect(() => {
    onKeysChange?.(keys);
  }, [keys, onKeysChange]);

  const animsRef = useRef<Record<string, Animated.ValueXY>>({});
  const draggingCodeRef = useRef<string | null>(null);
  const dragStartPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const alignmentAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const animCodes = useMemo(() => new Set(keys.map((k) => k.code)), [keys]);

  for (const code of animCodes) {
    if (!animsRef.current[code]) {
      const key = keys.find((k) => k.code === code);
      animsRef.current[code] = new Animated.ValueXY({
        x: key?.visualPosition.x ?? 0,
        y: key?.visualPosition.y ?? 0,
      });
    }
  }

  const getAnim = useCallback(
    (code: string) => {
      return (
        animsRef.current[code] ??
        new Animated.ValueXY({ x: 0, y: 0 })
      );
    },
    []
  );

  useImperativeHandle(ref, () => ({
    getKeys: () => keys.map((k) => ({ ...k })),
    getZOrder: () => [...zOrder],
    canAddKey: () => keys.length < MAX_CAPACITY,
    addKey: (code: string, label: string) => {
      setKeys((prev) => {
        if (prev.some((k) => k.code === code)) return prev;
        if (prev.length >= MAX_CAPACITY) return prev;
        const cell = findEmptyCell(prev);
        if (!cell) return prev;
        const newKey: KeyConfig = {
          code,
          label,
          visualPosition: cell,
        };
        const next = [...prev, newKey];
        animsRef.current[code] = new Animated.ValueXY({ x: cell.x, y: cell.y });
        return next;
      });
      setZOrder((prev) => {
        if (prev.includes(code)) return prev;
        return [...prev, code];
      });
    },
    removeKey: (code: string) => {
      setKeys((prev) => prev.filter((k) => k.code !== code));
      setZOrder((prev) => prev.filter((c) => c !== code));
      delete animsRef.current[code];
    },
    startAlignment: () => {
      setKeys((currentKeys) => {
        if (currentKeys.length === 0) return currentKeys;

        alignmentAnimRef.current?.stop();

        const targets = computeAlignmentTargets(currentKeys);
        const targetMap = new Map(targets.map((t) => [t.code, t]));

        const animations: Animated.CompositeAnimation[] = [];
        for (const key of currentKeys) {
          const target = targetMap.get(key.code);
          if (!target) continue;
          const anim = getAnim(key.code);
          const curX = (anim as any).__getValue?.().x ?? (anim as any)._value?.x ?? key.visualPosition.x;
          const curY = (anim as any).__getValue?.().y ?? (anim as any)._value?.y ?? key.visualPosition.y;

          anim.setValue({ x: curX, y: curY });

          animations.push(
            Animated.timing(anim, {
              toValue: { x: target.targetX, y: target.targetY },
              duration: 300,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            })
          );
        }

        if (animations.length > 0) {
          setIsAligning(true);
          alignmentAnimRef.current = Animated.parallel(animations);
          alignmentAnimRef.current.start(() => {
            setIsAligning(false);
            setKeys((prev) =>
              prev.map((k) => {
                const target = targetMap.get(k.code);
                if (!target) return k;
                return {
                  ...k,
                  visualPosition: { x: target.targetX, y: target.targetY },
                };
              })
            );
            alignmentAnimRef.current = null;
          });
        }

        return currentKeys;
      });
    },
    resetToCommitted: () => {
      alignmentAnimRef.current?.stop();
      alignmentAnimRef.current = null;
      setIsAligning(false);
      setKeys(committedKeys.map((k) => ({ ...k })));
      setZOrder([...committedZOrder]);
      animsRef.current = {};
      for (const k of committedKeys) {
        animsRef.current[k.code] = new Animated.ValueXY({
          x: k.visualPosition.x,
          y: k.visualPosition.y,
        });
      }
    },
    resetEverything: () => {
      alignmentAnimRef.current?.stop();
      alignmentAnimRef.current = null;
      setIsAligning(false);
      const defaults = [
        { code: 'KeyW', label: 'W', visualPosition: { x: CELL_SIZE, y: 0 } },
        { code: 'KeyA', label: 'A', visualPosition: { x: 0, y: CELL_SIZE } },
        { code: 'KeyS', label: 'S', visualPosition: { x: CELL_SIZE, y: CELL_SIZE } },
        { code: 'KeyD', label: 'D', visualPosition: { x: 2 * CELL_SIZE, y: CELL_SIZE } },
      ];
      setKeys(defaults);
      setZOrder(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
      animsRef.current = {};
      for (const k of defaults) {
        animsRef.current[k.code] = new Animated.ValueXY({
          x: k.visualPosition.x,
          y: k.visualPosition.y,
        });
      }
    },
  }));

  const handlePressIn = useCallback(
    (code: string) => {
      setPressed((p) => ({ ...p, [code]: true }));
      setZOrder((prev) => {
        const rest = prev.filter((c) => c !== code);
        return [...rest, code];
      });
      onKeyDown?.(code);
    },
    [onKeyDown]
  );

  const handlePressOut = useCallback(
    (code: string) => {
      setPressed((p) => ({ ...p, [code]: false }));
      onKeyUp?.(code);
    },
    [onKeyUp]
  );

  const createPanResponder = useCallback(
    (code: string) => {
      return PanResponder.create({
        onStartShouldSetPanResponder: () => !!layoutMode,
        onMoveShouldSetPanResponder: () => !!layoutMode,
        onPanResponderGrant: () => {
          draggingCodeRef.current = code;
          const key = keys.find((k) => k.code === code);
          if (key) {
            dragStartPosRef.current[code] = { ...key.visualPosition };
          }
          setZOrder((prev) => {
            const rest = prev.filter((c) => c !== code);
            return [...rest, code];
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const start = dragStartPosRef.current[code];
          if (!start) return;
          const rawX = start.x + gestureState.dx;
          const rawY = start.y + gestureState.dy;
          const clamped = clampToPanel(rawX, rawY);
          const anim = getAnim(code);
          anim.setValue({ x: clamped.x, y: clamped.y });
        },
        onPanResponderRelease: (_, gestureState) => {
          const start = dragStartPosRef.current[code];
          if (start) {
            const rawX = start.x + gestureState.dx;
            const rawY = start.y + gestureState.dy;
            const clamped = clampToPanel(rawX, rawY);
            setKeys((prev) =>
              prev.map((k) =>
                k.code === code
                  ? { ...k, visualPosition: { x: clamped.x, y: clamped.y } }
                  : k
              )
            );
          }
          draggingCodeRef.current = null;
          delete dragStartPosRef.current[code];
        },
        onPanResponderTerminate: () => {
          const start = dragStartPosRef.current[code];
          if (start) {
            const anim = getAnim(code);
            anim.setValue({ x: start.x, y: start.y });
          }
          draggingCodeRef.current = null;
          delete dragStartPosRef.current[code];
        },
      });
    },
    [layoutMode, keys, getAnim]
  );

  const panResponders = useMemo(() => {
    const result: Record<string, ReturnType<typeof PanResponder.create>> = {};
    for (const key of keys) {
      result[key.code] = createPanResponder(key.code);
    }
    return result;
  }, [keys, createPanResponder]);

  const renderBackground = (key: KeyConfig) => {
    const anim = getAnim(key.code);
    return (
      <Animated.View
        key={`bg-${key.code}`}
        pointerEvents="none"
        collapsable={false}
        style={[
          styles.buttonBase,
          {
            backgroundColor: pressed[key.code]
              ? theme.colors.primaryContainer
              : theme.colors.surfaceVariant,
            zIndex: zOrder.indexOf(key.code),
            transform: [{ translateX: anim.x }, { translateY: anim.y }],
          },
        ]}
      />
    );
  };

  const renderButton = (key: KeyConfig) => {
    const anim = getAnim(key.code);
    const zIndex = keys.length + zOrder.indexOf(key.code);
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
      const panHandlers = panResponders[key.code]?.panHandlers;
      return (
        <Animated.View
          key={key.code}
          collapsable={false}
          style={[
            styles.buttonBase,
            {
              zIndex,
              transform: [{ translateX: anim.x }, { translateY: anim.y }],
            },
          ]}
          {...panHandlers}
        >
          {button}
          <View style={styles.dragIndicator} pointerEvents="none">
            <MaterialCommunityIcons
              name="cursor-move"
              size={16}
              color={theme.colors.primary}
            />
          </View>
        </Animated.View>
      );
    }

    return (
      <Animated.View
        key={key.code}
        collapsable={false}
        style={[
          styles.buttonBase,
          {
            zIndex,
            transform: [{ translateX: anim.x }, { translateY: anim.y }],
          },
        ]}
      >
        {button}
      </Animated.View>
    );
  };

  return (
    <View style={[styles.panel, { width: PANEL_WIDTH, height: PANEL_HEIGHT }]}>
      {keys.map((key) => renderBackground(key))}
      {keys.map((key) => renderButton(key))}
    </View>
  );
});

const styles = StyleSheet.create({
  panel: {
    position: 'relative',
  },
  buttonBase: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 12,
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
