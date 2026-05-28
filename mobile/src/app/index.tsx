import { useState, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Surface, useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { MenuDrawer } from '@/components/menu-drawer';
import { KeyPanel, findEmptyGridCell, recalculateStoredPositions } from '@/components/key-panel';
import { TouchpadContainer } from '@/components/touchpad-container';
import { KeyboardModal } from '@/components/keyboard-modal';
import { useImmersiveMode } from '@/hooks/use-immersive-mode';
import { useLayoutConfig, defaultConfig, createDefaultConfig, LayoutConfig, KeyConfig } from '@/hooks/use-layout-config';

export default function GameControllerScreen() {
  const theme = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const { enterImmersive, exitImmersive } = useImmersiveMode();
  const { config, loaded, saveConfig } = useLayoutConfig();
  const [menuVisible, setMenuVisible] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const [keyboardModalVisible, setKeyboardModalVisible] = useState(false);
  const [draft, setDraft] = useState<LayoutConfig>(config);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const panelRef = useRef<View>(null);

  useFocusEffect(
    useCallback(() => {
      enterImmersive();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      return () => {
        exitImmersive();
        ScreenOrientation.unlockAsync();
      };
    }, [enterImmersive, exitImmersive])
  );

  const handleOpenMenu = useCallback(() => {
    setMenuVisible(true);
  }, []);

  const handleDismissMenu = useCallback(() => {
    setMenuVisible(false);
  }, []);

  const handleEnterLayoutMode = useCallback(() => {
    setDraft(config);
    setLayoutMode(true);
    setMenuVisible(false);
  }, [config]);

  const handleConfirmLayout = useCallback(() => {
    saveConfig(draft);
    setLayoutMode(false);
  }, [draft, saveConfig]);

  const handleCancelLayout = useCallback(() => {
    setLayoutMode(false);
  }, []);

  const handleOpenKeyboard = useCallback(() => {
    setKeyboardModalVisible(true);
  }, []);

  const handleDismissKeyboard = useCallback(() => {
    setKeyboardModalVisible(false);
  }, []);

  const handleKeyDown = useCallback((code: string) => {
    console.log('Key down:', code);
  }, []);

  const handleKeyUp = useCallback((code: string) => {
    console.log('Key up:', code);
  }, []);

  const handleButtonMove = useCallback((code: string, x: number, y: number) => {
    setDraft((prev) => ({
      ...prev,
      keys: prev.keys.map((k) => (k.code === code ? { ...k, offset: { x, y } } : k)),
    }));
  }, []);

  const handleBringToFront = useCallback((code: string) => {
    setDraft((prev) => {
      const order = [...(prev.keyZOrder ?? prev.keys.map((k) => k.code))];
      const idx = order.indexOf(code);
      if (idx !== -1) {
        order.splice(idx, 1);
      }
      order.push(code);
      return { ...prev, keyZOrder: order };
    });
  }, []);

  const selectedKeys = useMemo(() => {
    const active = layoutMode ? draft : config;
    return new Set(active.keys.map((k) => k.code));
  }, [layoutMode, draft, config]);

  const handleToggleKey = useCallback((code: string, label: string) => {
    setDraft((prev) => {
      const hasKey = prev.keys.some((k) => k.code === code);
      if (hasKey) {
        const afterRemove = prev.keys.filter((k) => k.code !== code);
        return {
          ...prev,
          keys: recalculateStoredPositions(afterRemove, panelSize.width),
          keyZOrder: prev.keyZOrder.filter((c) => c !== code),
        };
      } else {
        const newCell = findEmptyGridCell(panelSize.width, prev.keys);
        const newKey: KeyConfig = {
          code,
          label,
          offset: { x: 0, y: 0 },
          storedPosition: newCell,
        };
        const afterAdd = [...prev.keys, newKey];
        return {
          ...prev,
          keys: recalculateStoredPositions(afterAdd, panelSize.width),
          keyZOrder: [...prev.keyZOrder, code],
        };
      }
    });
  }, [panelSize.width]);

  const handleResetOffsets = useCallback(() => {
    setDraft((prev) => {
      const defaultCodes = new Set(defaultConfig.keys.map((d) => d.code));

      const defaultKeys = prev.keys
        .filter((k) => defaultCodes.has(k.code))
        .map((k) => ({
          ...k,
          offset: { x: 0, y: 0 },
          storedPosition: defaultConfig.keys.find((d) => d.code === k.code)!.storedPosition,
        }));

      const otherKeys = prev.keys
        .filter((k) => !defaultCodes.has(k.code))
        .map((k) => ({ ...k, offset: { x: 0, y: 0 } }));

      const resolved = [...defaultKeys];
      for (const k of otherKeys) {
        const empty = findEmptyGridCell(panelSize.width, resolved);
        resolved.push({ ...k, storedPosition: empty });
      }

      return {
        ...prev,
        keys: resolved,
        keyZOrder: defaultConfig.keyZOrder
          .filter((c) => prev.keys.some((k) => k.code === c))
          .concat(
            prev.keys.map((k) => k.code).filter((c) => !defaultConfig.keyZOrder.includes(c))
          ),
      };
    });
  }, [panelSize.width]);

  const handleResetKeys = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      keys: defaultConfig.keys.map((k) => ({ ...k, offset: { x: 0, y: 0 } })),
      keyZOrder: [...defaultConfig.keyZOrder],
    }));
  }, []);

  if (!loaded) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]} />
    );
  }

  const activeConfig = layoutMode ? draft : config;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={[styles.leftPanel, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View
          ref={panelRef}
          style={styles.leftPanelContent}
          onLayout={(e) => setPanelSize(e.nativeEvent.layout)}
        >
          {layoutMode && (
            <View style={styles.buttonsResetButton}>
              <IconButton
                icon={({ size, color }) => (
                  <MaterialCommunityIcons name="grid" size={size} color={color} />
                )}
                size={28}
                onPress={handleResetOffsets}
                iconColor={theme.colors.onSurface}
              />
            </View>
          )}
          <View style={styles.wasdWrapper}>
            <KeyPanel
              layoutMode={layoutMode}
              keys={activeConfig.keys}
              zOrder={activeConfig.keyZOrder}
              panelRef={panelRef}
              onMove={handleButtonMove}
              onBringToFront={handleBringToFront}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
            />
          </View>

          <View style={styles.menuButtonContainer}>
            {layoutMode ? (
              <View style={styles.layoutControls}>
                <IconButton
                  icon={({ size, color }) => (
                    <MaterialCommunityIcons name="keyboard" size={size} color={color} />
                  )}
                  size={28}
                  onPress={handleOpenKeyboard}
                  iconColor={theme.colors.onSurface}
                />
                <IconButton
                  icon={({ size, color }) => (
                    <MaterialCommunityIcons name="close" size={size} color={color} />
                  )}
                  size={28}
                  onPress={handleCancelLayout}
                  iconColor={theme.colors.error}
                />
                <IconButton
                  icon={({ size, color }) => (
                    <MaterialCommunityIcons name="check" size={size} color={color} />
                  )}
                  size={28}
                  onPress={handleConfirmLayout}
                  iconColor={theme.colors.primary}
                />
              </View>
            ) : (
              <IconButton
                icon={({ size, color }) => (
                  <MaterialCommunityIcons name="menu" size={size} color={color} />
                )}
                size={28}
                onPress={handleOpenMenu}
                iconColor={theme.colors.onSurface}
              />
            )}
          </View>
        </View>
      </Surface>

      <View style={styles.rightPanel}>
        <TouchpadContainer
          layoutMode={layoutMode}
          insets={{
            touchpadTop: draft.touchpadTop,
            touchpadBottom: draft.touchpadBottom,
            touchpadLeft: draft.touchpadLeft,
            touchpadRight: draft.touchpadRight,
          }}
          defaultInsets={defaultConfig}
          winW={winW}
          winH={winH}
          onChange={(next) =>
            setDraft((prev) => ({
              ...prev,
              touchpadTop: next.touchpadTop,
              touchpadBottom: next.touchpadBottom,
              touchpadLeft: next.touchpadLeft,
              touchpadRight: next.touchpadRight,
            }))
          }
        />
        {layoutMode && (
          <View style={styles.touchpadResetButton}>
            <IconButton
              icon={({ size, color }) => (
                <MaterialCommunityIcons name="overscan" size={size} color={color} />
              )}
              size={28}
              onPress={() =>
                setDraft((prev) => ({
                  ...prev,
                  touchpadTop: defaultConfig.touchpadTop,
                  touchpadBottom: defaultConfig.touchpadBottom,
                  touchpadLeft: defaultConfig.touchpadLeft,
                  touchpadRight: defaultConfig.touchpadRight,
                }))
              }
              iconColor={theme.colors.onSurface}
            />
          </View>
        )}
      </View>

      <MenuDrawer
        visible={menuVisible}
        onDismiss={handleDismissMenu}
        onEnterLayoutMode={handleEnterLayoutMode}
      />

      <KeyboardModal
        visible={keyboardModalVisible}
        onDismiss={handleDismissKeyboard}
        selectedKeys={selectedKeys}
        onToggleKey={handleToggleKey}
        onResetKeys={handleResetKeys}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPanel: {
    flex: 1,
    margin: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  leftPanelContent: {
    flex: 1,
    padding: 16,
  },
  wasdWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonContainer: {
    alignSelf: 'flex-end',
    zIndex: 1000,
  },
  layoutControls: {
    flexDirection: 'row',
    gap: 4,
  },
  rightPanel: {
    flex: 1,
    position: 'relative',
  },
  touchpadResetButton: {
    position: 'absolute',
    top: 6,
    right: 8,
  },
  buttonsResetButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1000,
  },
});
