import { useState, useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Surface, useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { MenuDrawer } from '@/components/menu-drawer';
import { WasdPad } from '@/components/wasd-pad';
import { TouchpadContainer } from '@/components/touchpad-container';
import { useImmersiveMode } from '@/hooks/use-immersive-mode';
import { useLayoutConfig, defaultConfig, createDefaultConfig, ButtonOffset } from '@/hooks/use-layout-config';

export default function GameControllerScreen() {
  const theme = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const { enterImmersive, exitImmersive } = useImmersiveMode();
  const { config, loaded, saveConfig } = useLayoutConfig();
  const [menuVisible, setMenuVisible] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const [draft, setDraft] = useState(config);

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
        <View style={styles.leftPanelContent}>
          <View style={styles.wasdWrapper}>
            <WasdPad
              layoutMode={layoutMode}
              offsets={buttonOffsets}
              zOrder={activeConfig.zOrder}
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
                    <MaterialCommunityIcons name="close" size={size} color={color} />
                  )}
                  size={28}
                  onPress={handleCancelLayout}
                  iconColor={theme.colors.error}
                />
                <IconButton
                  icon={({ size, color }) => (
                    <MaterialCommunityIcons name="refresh" size={size} color={color} />
                  )}
                  size={28}
                  onPress={() => setDraft(createDefaultConfig())}
                  iconColor={theme.colors.onSurface}
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
      </View>

      <MenuDrawer
        visible={menuVisible}
        onDismiss={handleDismissMenu}
        onEnterLayoutMode={handleEnterLayoutMode}
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
  },
  layoutControls: {
    flexDirection: 'row',
    gap: 4,
  },
  rightPanel: {
    flex: 1,
    position: 'relative',
  },
});
