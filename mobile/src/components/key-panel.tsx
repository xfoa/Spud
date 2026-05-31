import React, {
  useRef,
  useMemo,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  Easing,
  type GestureResponderHandlers,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ControllerButton } from './controller-button';
import { KeyConfig } from '@/hooks/use-layout-config';

const KeyBackground = React.memo(function KeyBackground({
  anim,
  pressed,
  zIndex,
}: {
  anim: Animated.ValueXY;
  pressed: boolean;
  zIndex: number;
}) {
  const theme = useTheme();
  return (
    <Animated.View
      pointerEvents="none"
      collapsable={false}
      style={[
        styles.buttonBase,
        {
          backgroundColor: pressed
            ? theme.colors.primaryContainer
            : theme.colors.surfaceVariant,
          zIndex,
          transform: [{ translateX: anim.x }, { translateY: anim.y }],
        },
      ]}
    />
  );
});

const KeyButtonView = React.memo(function KeyButtonView({
  keyConfig,
  anim,
  zIndex,
  layoutMode,
  panHandlers,
  onPressIn,
  onPressOut,
}: {
  keyConfig: KeyConfig;
  anim: Animated.ValueXY;
  zIndex: number;
  layoutMode?: boolean;
  panHandlers?: GestureResponderHandlers;
  onPressIn?: (code: string) => void;
  onPressOut?: (code: string) => void;
}) {
  const theme = useTheme();
  const button = (
    <ControllerButton
      label={keyConfig.label}
      transparent={true}
      disabled={layoutMode}
      onPressIn={layoutMode ? undefined : () => onPressIn?.(keyConfig.code)}
      onPressOut={layoutMode ? undefined : () => onPressOut?.(keyConfig.code)}
    />
  );

  if (layoutMode) {
    return (
      <Animated.View
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
});

const BUTTON_SIZE = 72;
const GAP = 8;
const CELL_SIZE = BUTTON_SIZE + GAP;
const SNAP_RESOLUTION = 2;
const SNAP_STEP = CELL_SIZE / SNAP_RESOLUTION;

interface KeyPanelProps {
  layoutMode?: boolean;
  committedKeys: KeyConfig[];
  committedZOrder: string[];
  onKeyDown?: (code: string) => void;
  onKeyUp?: (code: string) => void;
  onCancel?: () => void;
  onAccept?: () => void;
  onOpenMenu?: () => void;
  onOpenKeyboard?: () => void;
}

export interface KeyPanelRef {
  getKeys(): KeyConfig[];
  getZOrder(): string[];
  addKey(code: string, label: string): void;
  removeKey(code: string): void;
  canAddKey(): boolean;
  isAnimating(): boolean;
  startAlignment(): void;
  resetToCommitted(): void;
  resetEverything(): void;
  resetPositions(): void;
}

function snapPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / SNAP_STEP) * SNAP_STEP,
    y: Math.round(y / SNAP_STEP) * SNAP_STEP,
  };
}

// TODO: find when this is being run and optimise it. ideas:
// 1. memoise calls
// 2. store constants outwith function
// 3. call once, store a list of empty spaces
function findEmptyCell(
  existingKeys: { visualPosition: { x: number; y: number } }[],
  maxWidth: number,
  maxHeight: number
): { x: number; y: number } | null {
  const occupied = new Set<string>();
  for (const k of existingKeys) {
    const s = snapPosition(k.visualPosition.x, k.visualPosition.y);
    occupied.add(`${s.x},${s.y}`);
  }

  const maxCols = Math.floor(maxWidth / CELL_SIZE);
  const maxRows = Math.floor(maxHeight / CELL_SIZE);
  
  // Tier 1: even snap indices (non-overlapping)
  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      const x = col * CELL_SIZE;
      const y = row * CELL_SIZE;
      if (!occupied.has(`${x},${y}`)) {
        return { x, y };
      }
    }
  }

  // Tier 2: every 2nd odd snap index 
  const maxT2Cols = Math.floor(maxWidth / CELL_SIZE - 1 / SNAP_RESOLUTION);
  const maxT2Rows = Math.floor(maxHeight / CELL_SIZE - 1 / SNAP_RESOLUTION);
  for (let row = 0; row < maxT2Rows ; row += 2) {
    for (let col = 0; col < maxT2Cols; col += 2) {
      const x = col * CELL_SIZE + Math.floor(CELL_SIZE / SNAP_RESOLUTION);
      const y = row * CELL_SIZE + Math.floor(CELL_SIZE / SNAP_RESOLUTION);
      if (!occupied.has(`${x},${y}`)) {
        return { x, y };
      }
    }
  }

  return null;
}

function computeAlignmentTargets(
  keys: KeyConfig[],
  maxWidth: number,
  maxHeight: number
): { code: string; targetX: number; targetY: number }[] {
  const maxCols = Math.floor(maxWidth / CELL_SIZE);
  const maxRows = Math.floor(maxHeight / CELL_SIZE);

  const sorted = [...keys].sort((a, b) => {
    if (a.visualPosition.y !== b.visualPosition.y) {
      return a.visualPosition.y - b.visualPosition.y;
    }
    return a.visualPosition.x - b.visualPosition.x;
  });

  const occupied = new Set<string>();
  const targets: { code: string; targetX: number; targetY: number }[] = [];

  for (const key of sorted) {
    // Always prefer Tier 1 first: full grid cells
    let bestTier1: { x: number; y: number; dist: number } | null = null;
    for (let row = 0; row < maxRows; row++) {
      for (let col = 0; col < maxCols; col++) {
        const cx = col * CELL_SIZE;
        const cy = row * CELL_SIZE;
        if (cx + BUTTON_SIZE > maxWidth || cy + BUTTON_SIZE > maxHeight) continue;
        if (!occupied.has(`${cx},${cy}`)) {
          const dist = Math.hypot(cx - key.visualPosition.x, cy - key.visualPosition.y);
          if (!bestTier1 || dist < bestTier1.dist) {
            bestTier1 = { x: cx, y: cy, dist };
          }
        }
      }
    }

    if (bestTier1) {
      occupied.add(`${bestTier1.x},${bestTier1.y}`);
      targets.push({ code: key.code, targetX: bestTier1.x, targetY: bestTier1.y });
      continue;
    }

    // Fall back to Tier 2: every 2nd odd snap index starting from index 5
    let bestTier2: { x: number; y: number; dist: number } | null = null;
    for (let row = 4; row < maxRows * SNAP_RESOLUTION; row += 4) {
      for (let col = 4; col < maxCols * SNAP_RESOLUTION; col += 4) {
        const cx = col * SNAP_STEP + SNAP_STEP;
        const cy = row * SNAP_STEP + SNAP_STEP;
        if (cx + BUTTON_SIZE > maxWidth || cy + BUTTON_SIZE > maxHeight) continue;
        if (!occupied.has(`${cx},${cy}`)) {
          const dist = Math.hypot(cx - key.visualPosition.x, cy - key.visualPosition.y);
          if (!bestTier2 || dist < bestTier2.dist) {
            bestTier2 = { x: cx, y: cy, dist };
          }
        }
      }
    }

    if (bestTier2) {
      occupied.add(`${bestTier2.x},${bestTier2.y}`);
      targets.push({ code: key.code, targetX: bestTier2.x, targetY: bestTier2.y });
    }
  }

  return targets;
}

function clampToPanel(x: number, y: number, maxWidth: number, maxHeight: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(maxWidth - BUTTON_SIZE, x)),
    y: Math.max(0, Math.min(maxHeight - BUTTON_SIZE, y)),
  };
}

export const KeyPanel = forwardRef<KeyPanelRef, KeyPanelProps>(function KeyPanel(
  {
    layoutMode,
    committedKeys,
    committedZOrder,
    onKeyDown,
    onKeyUp,
    onCancel,
    onAccept,
    onOpenMenu,
    onOpenKeyboard,
  },
  ref
) {
  const theme = useTheme();

  const [keys, setKeys] = useState<KeyConfig[]>(committedKeys);
  const [zOrder, setZOrder] = useState<string[]>(committedZOrder);
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const capacityRef = useRef(0);

  const zIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < zOrder.length; i++) {
      map[zOrder[i]] = i;
    }
    return map;
  }, [zOrder]);

  const panelSizeRef = useRef({ width: 0, height: 0 });
  const alignmentTargetRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const recalcCapacity = useCallback(() => {
    const { width, height } = panelSizeRef.current;
    if (width === 0 || height === 0) {
      capacityRef.current = 0;
      return;
    }
    const maxCols = Math.floor(width / CELL_SIZE);
    const maxRows = Math.floor(height / CELL_SIZE);
    const tier1Capacity = maxCols * maxRows;
    const tier2Capacity =
      Math.floor(maxRows / 2) *
      Math.floor(maxCols / 2);
    capacityRef.current = tier1Capacity + tier2Capacity;
    console.log(maxCols, maxRows, tier1Capacity, tier2Capacity, capacityRef.current);
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    panelSizeRef.current = { width, height };
    recalcCapacity();
  }, [recalcCapacity]);

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
    getKeys: () => {
      if (isAnimating) {
        return keys.map((k) => {
          const target = alignmentTargetRef.current.get(k.code);
          return target
            ? { ...k, visualPosition: { x: target.x, y: target.y } }
            : { ...k };
        });
      }
      return keys.map((k) => ({ ...k }));
    },
    getZOrder: () => [...zOrder],
    canAddKey: () => Object.keys(animsRef.current).length < capacityRef.current,
    isAnimating: () => isAnimating,
    addKey: (code: string, label: string) => {
      setKeys((prev) => {
        if (prev.some((k) => k.code === code)) return prev;
        const { width, height } = panelSizeRef.current;
        const cell = findEmptyCell(prev, width, height);
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
      console.log(keys, capacityRef.current);
    },
    removeKey: (code: string) => {
      setKeys((prev) => prev.filter((k) => k.code !== code));
      setZOrder((prev) => prev.filter((c) => c !== code));
      delete animsRef.current[code];
      console.log(keys, capacityRef.current);
    },
    startAlignment: () => {
      setKeys((currentKeys) => {
        if (currentKeys.length === 0) return currentKeys;

        alignmentAnimRef.current?.stop();

        const { width, height } = panelSizeRef.current;
        const targets = computeAlignmentTargets(currentKeys, width, height);
        const targetMap = new Map(targets.map((t) => [t.code, { x: t.targetX, y: t.targetY }]));
        alignmentTargetRef.current = targetMap;

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
              toValue: { x: target.x, y: target.y },
              duration: 300,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            })
          );
        }

        if (animations.length > 0) {
          setIsAnimating(true);
          alignmentAnimRef.current = Animated.parallel(animations);
          alignmentAnimRef.current.start(() => {
            // Sync JS animated values to targets so the next render
            // does not flash back to stale start positions
            for (const key of currentKeys) {
              const target = targetMap.get(key.code);
              if (target) {
                const anim = getAnim(key.code);
                anim.setValue({ x: target.x, y: target.y });
              }
            }
            setIsAnimating(false);
            setKeys((prev) =>
              prev.map((k) => {
                const target = targetMap.get(k.code);
                if (!target) return k;
                return {
                  ...k,
                  visualPosition: { x: target.x, y: target.y },
                };
              })
            );
            alignmentAnimRef.current = null;
          });
        }

        return currentKeys;
      });
    },
    resetPositions: () => {
      const { width, height } = panelSizeRef.current;
      const cols = Math.floor(width / CELL_SIZE);
      if (cols === 0) return;

      const defaults = keys.map((k, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          ...k,
          visualPosition: { x: col * CELL_SIZE, y: row * CELL_SIZE },
        };
      });

      const animations: Animated.CompositeAnimation[] = [];
      for (const key of defaults) {
        const anim = getAnim(key.code);
        const curX = (anim as any).__getValue?.().x ?? (anim as any)._value?.x ?? key.visualPosition.x;
        const curY = (anim as any).__getValue?.().y ?? (anim as any)._value?.y ?? key.visualPosition.y;
        anim.setValue({ x: curX, y: curY });
        animations.push(
          Animated.timing(anim, {
            toValue: key.visualPosition,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        );
      }

      setIsAnimating(true);
      Animated.parallel(animations).start(() => {
        setKeys(defaults);
        setIsAnimating(false);
      });
    },
    resetToCommitted: () => {
      alignmentAnimRef.current?.stop();
      alignmentAnimRef.current = null;
      setIsAnimating(false);
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
      setIsAnimating(false);
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

  const panRespondersRef = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});

  const getPanHandlers = useCallback(
    (code: string) => {
      if (!panRespondersRef.current[code]) {
        panRespondersRef.current[code] = PanResponder.create({
          onStartShouldSetPanResponder: () => !!layoutMode,
          onMoveShouldSetPanResponder: () => !!layoutMode,
          onPanResponderGrant: () => {
            draggingCodeRef.current = code;

            // Cancel animation for this key only (imperative, no re-render)
            const anim = getAnim(code);
            anim.stopAnimation();

            setZOrder((prev) => {
              const rest = prev.filter((c) => c !== code);
              return [...rest, code];
            });

            // Read current animated value as drag start position
            const curValue = (anim as any).__getValue?.();
            dragStartPosRef.current[code] = curValue || { x: 0, y: 0 };
          },
          onPanResponderMove: (_, gestureState) => {
            const start = dragStartPosRef.current[code];
            if (!start) return;
            const rawX = start.x + gestureState.dx;
            const rawY = start.y + gestureState.dy;
            const { width, height } = panelSizeRef.current;
            const clamped = clampToPanel(rawX, rawY, width, height);
            const anim = getAnim(code);
            anim.setValue({ x: clamped.x, y: clamped.y });
          },
          onPanResponderRelease: (_, gestureState) => {
            const start = dragStartPosRef.current[code];
            if (start) {
              const rawX = start.x + gestureState.dx;
              const rawY = start.y + gestureState.dy;
              const { width, height } = panelSizeRef.current;
              const clamped = clampToPanel(rawX, rawY, width, height);
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
      }
      return panRespondersRef.current[code].panHandlers;
    },
    [layoutMode, getAnim]
  );


  return (
    <View style={styles.panel} onLayout={handleLayout}>
      {/* Middle layer: key buttons */}
      <View style={styles.keysLayer} pointerEvents="box-none">
        {keys.map((key) => (
          <KeyBackground
            key={`bg-${key.code}`}
            anim={getAnim(key.code)}
            pressed={pressed[key.code] ?? false}
            zIndex={zIndexMap[key.code] ?? 0}
          />
        ))}
        {keys.map((key) => (
          <KeyButtonView
            key={key.code}
            keyConfig={key}
            anim={getAnim(key.code)}
            zIndex={keys.length + (zIndexMap[key.code] ?? 0)}
            layoutMode={layoutMode}
            panHandlers={layoutMode ? getPanHandlers(key.code) : undefined}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          />
        ))}
      </View>

      {/* Top layer: action buttons */}
      <View style={styles.actionLayer} pointerEvents="box-none">
        <View style={styles.menuButtons} pointerEvents="auto">
          {layoutMode ? (
            <View style={styles.layoutControls}>
              {onOpenKeyboard && (
                <IconButton
                  icon={({ size, color }) => (
                    <MaterialCommunityIcons name="keyboard" size={size} color={color} />
                  )}
                  size={28}
                  onPress={onOpenKeyboard}
                  iconColor={theme.colors.onSurface}
                />
              )}
              {onCancel && (
                <IconButton
                  icon={({ size, color }) => (
                    <MaterialCommunityIcons name="close" size={size} color={color} />
                  )}
                  size={28}
                  onPress={onCancel}
                  iconColor={theme.colors.error}
                />
              )}
              {onAccept && (
                <IconButton
                  icon={({ size, color }) => (
                    <MaterialCommunityIcons name="check" size={size} color={color} />
                  )}
                  size={28}
                  onPress={onAccept}
                  iconColor={theme.colors.primary}
                />
              )}
            </View>
          ) : (
            onOpenMenu && (
              <IconButton
                icon={({ size, color }) => (
                  <MaterialCommunityIcons name="menu" size={size} color={color} />
                )}
                size={28}
                onPress={onOpenMenu}
                iconColor={theme.colors.onSurface}
              />
            )
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  keysLayer: {
    ...StyleSheet.absoluteFill,
  },
  actionLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
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
  menuButtons: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  layoutControls: {
    flexDirection: 'row',
    gap: 4,
  },
});
