import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
  Pressable,
  Animated,
} from 'react-native';
import { Portal, IconButton, useTheme, Text } from 'react-native-paper';

interface KeyboardModalProps {
  visible: boolean;
  onDismiss: () => void;
  selectedKeys: Set<string>;
  onToggleKey: (code: string, label: string) => void;
  onResetKeys?: () => void;
  canAddKey?: () => boolean;
}

interface KeyDef {
  label: string;
  code: string;
  width?: number;
  tall?: boolean;
}

interface KeyPosition {
  code: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const BASE_KEY_SIZE = 44;
const KEY_GAP = 2;
const SECTION_GAP = 48;
const HORIZONTAL_PADDING = 3;

const MAIN_ROWS: KeyDef[][] = [
  [
    { label: 'Esc', code: 'Escape', width: 1 },
    { label: '', code: '', width: 0.666 },
    { label: 'F1', code: 'F1' },
    { label: 'F2', code: 'F2' },
    { label: 'F3', code: 'F3' },
    { label: 'F4', code: 'F4' },
    { label: '', code: '', width: 0.666 },
    { label: 'F5', code: 'F5' },
    { label: 'F6', code: 'F6' },
    { label: 'F7', code: 'F7' },
    { label: 'F8', code: 'F8' },
    { label: '', code: '', width: 0.666 },
    { label: 'F9', code: 'F9' },
    { label: 'F10', code: 'F10' },
    { label: 'F11', code: 'F11' },
    { label: 'F12', code: 'F12' },
  ],
  [
    { label: '`', code: 'Backquote' },
    { label: '1', code: 'Digit1' },
    { label: '2', code: 'Digit2' },
    { label: '3', code: 'Digit3' },
    { label: '4', code: 'Digit4' },
    { label: '5', code: 'Digit5' },
    { label: '6', code: 'Digit6' },
    { label: '7', code: 'Digit7' },
    { label: '8', code: 'Digit8' },
    { label: '9', code: 'Digit9' },
    { label: '0', code: 'Digit0' },
    { label: '-', code: 'Minus' },
    { label: '=', code: 'Equal' },
    { label: 'Backspace', code: 'Backspace', width: 2 },
  ],
  [
    { label: 'Tab', code: 'Tab', width: 1.5 },
    { label: 'Q', code: 'KeyQ' },
    { label: 'W', code: 'KeyW' },
    { label: 'E', code: 'KeyE' },
    { label: 'R', code: 'KeyR' },
    { label: 'T', code: 'KeyT' },
    { label: 'Y', code: 'KeyY' },
    { label: 'U', code: 'KeyU' },
    { label: 'I', code: 'KeyI' },
    { label: 'O', code: 'KeyO' },
    { label: 'P', code: 'KeyP' },
    { label: '[', code: 'BracketLeft' },
    { label: ']', code: 'BracketRight' },
    { label: 'Enter', code: 'Enter', width: 1.5 },
  ],
  [
    { label: 'Caps', code: 'CapsLock', width: 1.75 },
    { label: 'A', code: 'KeyA' },
    { label: 'S', code: 'KeyS' },
    { label: 'D', code: 'KeyD' },
    { label: 'F', code: 'KeyF' },
    { label: 'G', code: 'KeyG' },
    { label: 'H', code: 'KeyH' },
    { label: 'J', code: 'KeyJ' },
    { label: 'K', code: 'KeyK' },
    { label: 'L', code: 'KeyL' },
    { label: ';', code: 'Semicolon' },
    { label: "'", code: 'Quote' },
    { label: '#', code: 'Backslash' },
    { label: '', code: '', width: 0.25 },
  ],
  [
    { label: 'Shift', code: 'ShiftLeft', width: 1.25 },
    { label: '\\', code: 'IntlBackslash' },
    { label: 'Z', code: 'KeyZ' },
    { label: 'X', code: 'KeyX' },
    { label: 'C', code: 'KeyC' },
    { label: 'V', code: 'KeyV' },
    { label: 'B', code: 'KeyB' },
    { label: 'N', code: 'KeyN' },
    { label: 'M', code: 'KeyM' },
    { label: ',', code: 'Comma' },
    { label: '.', code: 'Period' },
    { label: '/', code: 'Slash' },
    { label: 'Shift', code: 'ShiftRight', width: 2.75 },
  ],
  [
    { label: 'Ctrl', code: 'ControlLeft', width: 1.25 },
    { label: 'Win', code: 'MetaLeft', width: 1.25 },
    { label: 'Alt', code: 'AltLeft', width: 1.25 },
    { label: 'Space', code: 'Space', width: 6.25 },
    { label: 'AltGr', code: 'AltRight', width: 1.25 },
    { label: 'Win', code: 'MetaRight', width: 1.25 },
    { label: 'Menu', code: 'ContextMenu', width: 1.25 },
    { label: 'Ctrl', code: 'ControlRight', width: 1.25 },
  ],
];

const NAV_ROWS: KeyDef[][] = [
  [
    { label: 'Ins', code: 'Insert' },
    { label: 'Home', code: 'Home' },
    { label: 'PgUp', code: 'PageUp' },
  ],
  [
    { label: 'Del', code: 'Delete' },
    { label: 'End', code: 'End' },
    { label: 'PgDn', code: 'PageDown' },
  ],
  [
    { label: '', code: '' },
    { label: '', code: '' },
    { label: '', code: '' },
  ],
  [
    { label: '', code: '' },
    { label: 'Up', code: 'ArrowUp' },
    { label: '', code: '' },
  ],
  [
    { label: 'Left', code: 'ArrowLeft' },
    { label: 'Down', code: 'ArrowDown' },
    { label: 'Right', code: 'ArrowRight' },
  ],
];

const NUMPAD_COLS: KeyDef[][] = [
  [
    { label: 'Num', code: 'NumLock' },
    { label: '7', code: 'Numpad7' },
    { label: '4', code: 'Numpad4' },
    { label: '1', code: 'Numpad1' },
    { label: '0', code: 'Numpad0', width: 2 },
  ],
  [
    { label: '/', code: 'NumpadDivide' },
    { label: '8', code: 'Numpad8' },
    { label: '5', code: 'Numpad5' },
    { label: '2', code: 'Numpad2' },
    { label: '', code: '', width: 1 },
  ],
  [
    { label: '*', code: 'NumpadMultiply' },
    { label: '9', code: 'Numpad9' },
    { label: '6', code: 'Numpad6' },
    { label: '3', code: 'Numpad3' },
    { label: '.', code: 'NumpadDecimal' },
  ],
  [
    { label: '-', code: 'NumpadSubtract' },
    { label: '+', code: 'NumpadAdd', tall: true },
    { label: 'Enter', code: 'NumpadEnter', tall: true },
  ],
];

function keyWidth(def: KeyDef, keySize: number): number {
  const w = def.width ?? 1;
  return w * keySize + (w - 1) * KEY_GAP;
}

function keyHeight(def: KeyDef, keySize: number): number {
  return def.tall ? keySize * 2 + KEY_GAP : keySize;
}

function computeLayout(keySize: number): {
  positions: KeyPosition[];
  contentWidth: number;
  contentHeight: number;
} {
  const positions: KeyPosition[] = [];

  let mainMaxX = 0;
  let mainY = 0;
  MAIN_ROWS.forEach((row) => {
    let x = 0;
    row.forEach((def) => {
      const w = keyWidth(def, keySize);
      const h = keyHeight(def, keySize);
      if (def.code) {
        positions.push({
          code: def.code,
          label: def.label,
          x: x + HORIZONTAL_PADDING,
          y: mainY,
          width: w,
          height: h,
        });
      }
      x += w + KEY_GAP;
    });
    mainMaxX = Math.max(mainMaxX, x - KEY_GAP);
    mainY += keySize + KEY_GAP;
  });

  const mainHeight = mainY - KEY_GAP;

  let navMaxX = 0;
  let navY = keySize + KEY_GAP;
  const navX = mainMaxX + SECTION_GAP;
  NAV_ROWS.forEach((row) => {
    let x = navX;
    row.forEach((def) => {
      const w = keyWidth(def, keySize);
      const h = keyHeight(def, keySize);
      if (def.code) {
        positions.push({
          code: def.code,
          label: def.label,
          x: x + HORIZONTAL_PADDING,
          y: navY,
          width: w,
          height: h,
        });
      }
      x += w + KEY_GAP;
    });
    navMaxX = Math.max(navMaxX, x - KEY_GAP);
    navY += keySize + KEY_GAP;
  });

  let numpadMaxX = 0;
  let numpadY = keySize + KEY_GAP;
  const numpadStartX = navMaxX + SECTION_GAP;
  let colX = numpadStartX;
  NUMPAD_COLS.forEach((col) => {
    let colY = numpadY;
    col.forEach((def) => {
      const w = keyWidth(def, keySize);
      const h = keyHeight(def, keySize);
      if (def.code) {
        positions.push({
          code: def.code,
          label: def.label,
          x: colX + HORIZONTAL_PADDING,
          y: colY,
          width: w,
          height: h,
        });
      }
      colY += h + KEY_GAP;
    });
    colX += keySize + KEY_GAP;
  });
  numpadMaxX = colX - KEY_GAP;

  const contentWidth = numpadMaxX + HORIZONTAL_PADDING * 2;
  const numpadHeight = NUMPAD_COLS.reduce((max, col) => {
    let y = numpadY;
    col.forEach((def) => {
      y += keyHeight(def, keySize) + KEY_GAP;
    });
    return Math.max(max, y - KEY_GAP);
  }, 0);
  const contentHeight = Math.max(mainHeight, navY - KEY_GAP, numpadHeight);

  return { positions, contentWidth, contentHeight };
}

const KeyButton = React.memo(function KeyButton({
  keyDef,
  selected,
  disabled,
  onToggle,
}: {
  keyDef: KeyPosition;
  selected: boolean;
  disabled: boolean;
  onToggle: (code: string, label: string) => void;
}) {
  const theme = useTheme();

  const handlePress = useCallback(() => {
    if (!disabled) {
      onToggle(keyDef.code, keyDef.label);
    }
  }, [disabled, keyDef.code, keyDef.label, onToggle]);

  return (
    <Pressable
      onPress={handlePress}
      style={{
        position: 'absolute',
        left: keyDef.x,
        top: keyDef.y,
        width: keyDef.width,
        height: keyDef.height,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant,
        backgroundColor: disabled
          ? 'rgba(0,0,0,0.12)'
          : selected
          ? theme.colors.primaryContainer
          : theme.colors.surfaceVariant,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 2,
      }}
    >
      <Text
        variant="bodySmall"
        style={{
          fontSize: 10,
          fontWeight: '600',
          textAlign: 'center',
          color: disabled
            ? theme.colors.outline
            : selected
            ? theme.colors.onPrimaryContainer
            : theme.colors.onSurfaceVariant,
        }}
      >
        {keyDef.label}
      </Text>
    </Pressable>
  );
});

export function KeyboardModal({ visible, onDismiss, selectedKeys, onToggleKey, onResetKeys, canAddKey }: KeyboardModalProps) {
  const theme = useTheme();
  const { width: winW } = useWindowDimensions();
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  const keySize = BASE_KEY_SIZE;
  const { positions: keyPositions, contentWidth, contentHeight } = useMemo(
    () => computeLayout(keySize),
    []
  );

  const cardWidth = Math.min(winW - 32, 1200);

  const thumbWidth = useMemo(() => {
    if (viewportSize.width === 0) return 0;
    return Math.max(
      20,
      ((viewportSize.width - 16) / contentWidth) * viewportSize.width
    );
  }, [viewportSize.width, contentWidth]);

  const trackWidth = useMemo(() => {
    return Math.max(0, viewportSize.width - 16);
  }, [viewportSize.width]);

  const thumbLeft = useMemo(() => {
    if (trackWidth === 0 || thumbWidth === 0) return 0;
    const maxOffset = Math.max(1, contentWidth - viewportSize.width);
    const maxLeft = Math.max(0, trackWidth - thumbWidth);
    return scrollX.interpolate({
      inputRange: [0, maxOffset],
      outputRange: [0, maxLeft],
      extrapolate: 'clamp',
    });
  }, [scrollX, trackWidth, thumbWidth, contentWidth, viewportSize.width]);

  if (!visible) return null;

  return (
    <Portal>
      <View style={styles.backdrop}>
        <View style={styles.backdropTouchable} onTouchEnd={onDismiss} />
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, width: cardWidth },
          ]}
        >
          <View style={styles.modalButtons}>
            <IconButton
              icon="restore"
              size={24}
              onPress={onResetKeys}
              iconColor={theme.colors.onSurface}
              containerColor={theme.colors.surface}
              style={{ margin: 0 }}
            />
            <IconButton
              icon="close"
              size={24}
              onPress={onDismiss}
              iconColor={theme.colors.onSurface}
              containerColor={theme.colors.surface}
              style={{ margin: 0 }}
            />
          </View>
          <View
            style={styles.viewportWrapper}
            onLayout={(e) => setViewportSize(e.nativeEvent.layout)}
          >
            {viewportSize.width > 0 && (
              <Animated.ScrollView
                ref={scrollViewRef}
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                persistentScrollbar={true}
                contentContainerStyle={{
                  width: contentWidth,
                  minHeight: contentHeight,
                }}
                scrollEventThrottle={16}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                  { useNativeDriver: true }
                )}
              >
                <View
                  style={{
                    width: contentWidth,
                    height: contentHeight,
                  }}
                >
                  {(() => {
                    const atCapacity = canAddKey ? !canAddKey() : false;
                    return keyPositions.map((key) => {
                      const selected = selectedKeys.has(key.code);
                      const disabled = !selected && atCapacity;
                      return (
                        <KeyButton
                          key={key.code}
                          keyDef={key}
                          selected={selected}
                          disabled={disabled}
                          onToggle={onToggleKey}
                        />
                      );
                    });
                  })()}
                </View>
              </Animated.ScrollView>
            )}
          </View>
          {viewportSize.width > 0 && contentWidth > viewportSize.width && (
            <View style={styles.scrollbarContainer}>
              <View
                style={[
                  styles.scrollbarTrack,
                  { width: viewportSize.width - 16 },
                ]}
              >
                <Animated.View
                  style={[
                    styles.scrollbarThumb,
                    {
                      width: thumbWidth,
                      transform: [{ translateX: thumbLeft }],
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  backdropTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    maxHeight: '100%',
    minHeight: 318,
    zIndex: 1,
    flexDirection: 'column',
  },
  modalButtons: {
    position: 'absolute',
    top: -12,
    right: -12,
    zIndex: 10,
    flexDirection: 'row',
    gap: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  viewportWrapper: {
    flex: 1,
    minHeight: 200,
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  scrollbarContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  scrollbarTrack: {
    height: 4,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    borderRadius: 2,
  },
  scrollbarThumb: {
    position: 'absolute',
    top: 0,
    height: 4,
    backgroundColor: 'rgba(128, 128, 128, 0.6)',
    borderRadius: 2,
  },
});
