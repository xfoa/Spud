import { useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Surface, useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { MenuDrawer } from '@/components/menu-drawer';
import { KeyPanel, KeyPanelRef } from '@/components/key-panel';
import { TouchpadContainer } from '@/components/touchpad-container';
import { KeyboardModal } from '@/components/keyboard-modal';
import { useImmersiveMode } from '@/hooks/use-immersive-mode';
import { useLayoutConfig, defaultConfig, LayoutConfig } from '@/hooks/use-layout-config';

export default function GameControllerScreen() {
  const theme = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const { enterImmersive, exitImmersive } = useImmersiveMode();
  const { config, loaded, saveConfig } = useLayoutConfig();
  const [menuVisible, setMenuVisible] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const [keyboardModalVisible, setKeyboardModalVisible] = useState(false);
  const [draft, setDraft] = useState<LayoutConfig>(config);
  const keyPanelRef = useRef<KeyPanelRef>(null);

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
    const keys = keyPanelRef.current?.getKeys() ?? draft.keys;
    const zOrder = keyPanelRef.current?.getZOrder() ?? draft.keyZOrder;
    const next: LayoutConfig = { ...draft, keys, keyZOrder: zOrder };
    saveConfig(next);
    setLayoutMode(false);
  }, [draft, saveConfig]);

  const handleCancelLayout = useCallback(() => {
    keyPanelRef.current?.resetToCommitted();
    setLayoutMode(false);
  }, []);

  const handleOpenKeyboard = useCallback(() => {
    const currentKeys = keyPanelRef.current?.getKeys() ?? config.keys;
    setSelectedKeys(new Set(currentKeys.map((k) => k.code)));
    setKeyboardModalVisible(true);
  }, [config]);

  const handleDismissKeyboard = useCallback(() => {
    setKeyboardModalVisible(false);
  }, []);

  const handleKeyDown = useCallback((code: string) => {
    console.log('Key down:', code);
  }, []);

  const handleKeyUp = useCallback((code: string) => {
    console.log('Key up:', code);
  }, []);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    new Set(config.keys.map((k) => k.code))
  );

  // Derive selected keys from config rather than from intermediate KeyPanel state
  useEffect(() => {
    setSelectedKeys(new Set(config.keys.map((k) => k.code)));
  }, [config]);

  const handleToggleKey = useCallback((code: string, label: string) => {
    if (selectedKeys.has(code)) {
      keyPanelRef.current?.removeKey(code);
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
    } else if (keyPanelRef.current?.canAddKey() ?? false) {
      keyPanelRef.current?.addKey(code, label);
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.add(code);
        return next;
      });
    }
  }, [selectedKeys]);

  const handleResetOffsets = useCallback(() => {
    keyPanelRef.current?.startAlignment();
  }, []);

  const handleResetKeys = useCallback(() => {
    keyPanelRef.current?.resetEverything();
    setSelectedKeys(new Set(defaultConfig.keys.map((k) => k.code)));
  }, []);

  if (!loaded) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]} />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
    {layoutMode && (
        <View style={styles.alignButton}>
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
      <Surface style={[styles.leftPanel, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.leftPanelContent}>
          <View style={styles.wasdWrapper}>
            <KeyPanel
              ref={keyPanelRef}
              layoutMode={layoutMode}
              committedKeys={config.keys}
              committedZOrder={config.keyZOrder}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              onCancel={handleCancelLayout}
              onAccept={handleConfirmLayout}
              onOpenMenu={handleOpenMenu}
              onOpenKeyboard={handleOpenKeyboard}
            />
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
        canAddKey={() => keyPanelRef.current?.canAddKey() ?? false}
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
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  leftPanelContent: {
    flex: 1,
    padding: 4,
  },
  wasdWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  alignButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 1000,
  },
});
