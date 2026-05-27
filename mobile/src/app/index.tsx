import { useState, useCallback, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Surface, useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { MenuDrawer } from '@/components/menu-drawer';
import { WasdPad } from '@/components/wasd-pad';
import { TouchpadContainer } from '@/components/touchpad-container';
import { KeyboardModal } from '@/components/keyboard-modal';
import { useImmersiveMode } from '@/hooks/use-immersive-mode';
import { useLayoutConfig, defaultConfig, createDefaultConfig, ButtonOffset } from '@/hooks/use-layout-config';

export default function GameControllerScreen() {
  const theme = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const { enterImmersive, exitImmersive } = useImmersiveMode();
  const { config, loaded, saveConfig } = useLayoutConfig();
  const [menuVisible, setMenuVisible] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const [keyboardModalVisible, setKeyboardModalVisible] = useState(false);
  const [draft, setDraft] = useState(config);
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

  const handleKeyDown = useCallback((key: string) => {
    console.log('Key down:', key);
  }, []);

  const handleKeyUp = useCallback((key: string) => {
    console.log('Key up:', key);
  }, []);

  const handleButtonMove = useCallback(
    (key: 'w' | 'a' | 's' | 'd', x: number, y: number) => {
      setDraft((prev) => ({
        ...prev,
        [`${key}Offset`]: { x, y } as ButtonOffset,
      }));
    },
    []
  );

  const handleBringToFront = useCallback(
    (key: 'w' | 'a' | 's' | 'd') => {
      setDraft((prev) => {
        const order = [...(prev.zOrder ?? ['w', 'a', 's', 'd'])];
        const idx = order.indexOf(key);
        if (idx !== -1) {
          order.splice(idx, 1);
        }
        order.push(key);
        return { ...prev, zOrder: order };
      });
    },
    []
  );

  if (!loaded) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]} />
    );
  }

  const activeConfig = layoutMode ? draft : config;
  const buttonOffsets = {
    w: activeConfig.wOffset,
    a: activeConfig.aOffset,
    s: activeConfig.sOffset,
    d: activeConfig.dOffset,
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={[styles.leftPanel, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View ref={panelRef} style={styles.leftPanelContent}>
          {layoutMode && (
            <View style={styles.buttonsResetButton}>
              <IconButton
                icon={({ size, color }) => (
                  <MaterialCommunityIcons name="restore" size={size} color={color} />
                )}
                size={28}
                onPress={() =>
                  setDraft((prev) => ({
                    ...prev,
                    wOffset: defaultConfig.wOffset,
                    aOffset: defaultConfig.aOffset,
                    sOffset: defaultConfig.sOffset,
                    dOffset: defaultConfig.dOffset,
                    zOrder: defaultConfig.zOrder,
                  }))
                }
                iconColor={theme.colors.onSurface}
              />
            </View>
          )}
          <View style={styles.wasdWrapper}>
            <WasdPad
              layoutMode={layoutMode}
              offsets={buttonOffsets}
              zOrder={activeConfig.zOrder}
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
    zIndex: 20,
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
    zIndex: 20,
  },
});
