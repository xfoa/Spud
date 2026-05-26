import { useState, useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Surface, useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Touchpad } from '@/components/touchpad';
import { MenuDrawer } from '@/components/menu-drawer';
import { WasdPad } from '@/components/wasd-pad';
import { DraggableButton } from '@/components/draggable-button';
import { ResizeHandle } from '@/components/resize-handle';
import { useImmersiveMode } from '@/hooks/use-immersive-mode';
import { useLayoutConfig, defaultConfig } from '@/hooks/use-layout-config';

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

  if (!loaded) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]} />
    );
  }

  const tp = layoutMode ? draft : config;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={[styles.leftPanel, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.leftPanelContent}>
          <View style={styles.wasdWrapper}>
            {layoutMode ? (
              <DraggableButton
                offsetX={draft.wasdOffsetX}
                offsetY={draft.wasdOffsetY}
                onMove={(dx, dy) => setDraft((prev) => ({ ...prev, wasdOffsetX: dx, wasdOffsetY: dy }))}
              >
                <WasdPad onKeyDown={handleKeyDown} onKeyUp={handleKeyUp} />
              </DraggableButton>
            ) : (
              <View style={{ transform: [{ translateX: config.wasdOffsetX }, { translateY: config.wasdOffsetY }] }}>
                <WasdPad onKeyDown={handleKeyDown} onKeyUp={handleKeyUp} />
              </View>
            )}
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
                  onPress={() => setDraft(defaultConfig)}
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
        <View
          style={[
            styles.touchpadWrapper,
            {
              top: tp.touchpadTop,
              bottom: tp.touchpadBottom,
              left: tp.touchpadLeft,
              right: tp.touchpadRight,
            },
          ]}
        >
          {layoutMode && (
            <>
              <ResizeHandle
                edge="top"
                onResize={(_, dy) =>
                  setDraft((prev) => ({
                    ...prev,
                    touchpadTop: Math.max(
                      defaultConfig.touchpadTop,
                      Math.min(winH - prev.touchpadBottom - 100, prev.touchpadTop + dy)
                    ),
                  }))
                }
              />
              <ResizeHandle
                edge="bottom"
                onResize={(_, dy) =>
                  setDraft((prev) => ({
                    ...prev,
                    touchpadBottom: Math.max(
                      defaultConfig.touchpadBottom,
                      Math.min(winH - prev.touchpadTop - 100, prev.touchpadBottom - dy)
                    ),
                  }))
                }
              />
              <ResizeHandle
                edge="left"
                onResize={(dx) =>
                  setDraft((prev) => ({
                    ...prev,
                    touchpadLeft: Math.max(
                      defaultConfig.touchpadLeft,
                      Math.min(Math.floor(winW / 2) - prev.touchpadRight - 100, prev.touchpadLeft + dx)
                    ),
                  }))
                }
              />
              <ResizeHandle
                edge="right"
                onResize={(dx) =>
                  setDraft((prev) => ({
                    ...prev,
                    touchpadRight: Math.max(
                      defaultConfig.touchpadRight,
                      Math.min(Math.floor(winW / 2) - prev.touchpadLeft - 100, prev.touchpadRight - dx)
                    ),
                  }))
                }
              />
            </>
          )}
          <Touchpad
            onTouchStart={(x, y) => console.log('Touch start:', x, y)}
            onTouchMove={(x, y) => console.log('Touch move:', x, y)}
            onTouchEnd={() => console.log('Touch end')}
          />
        </View>
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
  touchpadWrapper: {
    position: 'absolute',
    overflow: 'visible',
  },
});
