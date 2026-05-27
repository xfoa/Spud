import { useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableWithoutFeedback,
  PanResponder,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Portal, Button, useTheme, Text } from 'react-native-paper';

const SHEET_HEIGHT = 320;
const CLOSE_THRESHOLD = 80;

interface MenuDrawerProps {
  visible: boolean;
  onDismiss: () => void;
  onEnterLayoutMode: () => void;
}

export function MenuDrawer({ visible, onDismiss, onEnterLayoutMode }: MenuDrawerProps) {
  const theme = useTheme();
  const translateY = useMemo(() => new Animated.Value(SHEET_HEIGHT), []);
  const backdropOpacity = useMemo(() => new Animated.Value(0), []);
  const skipNextCloseAnimation = useRef(false);

  const animateTo = useCallback(
    (target: number) => {
      const isOpen = target === 0;
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: target,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: isOpen ? 0.5 : 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [translateY, backdropOpacity]
  );

  useEffect(() => {
    if (!visible && skipNextCloseAnimation.current) {
      skipNextCloseAnimation.current = false;
      return;
    }
    if (visible) {
      animateTo(0);
    } else {
      animateTo(SHEET_HEIGHT);
    }
  }, [visible, animateTo]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        onDismiss();
      };
    }, [onDismiss])
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 5,
        onPanResponderMove: (_, gesture) => {
          const newY = Math.max(0, gesture.dy);
          translateY.setValue(newY);
          const opacity = Math.max(0, 0.5 - newY / SHEET_HEIGHT / 2);
          backdropOpacity.setValue(opacity);
        },
        onPanResponderRelease: (_, gesture) => {
          const isFlick = gesture.vy > 0.5;
          const shouldClose = gesture.dy > CLOSE_THRESHOLD || isFlick;

          if (shouldClose) {
            skipNextCloseAnimation.current = true;
            const remaining = SHEET_HEIGHT - gesture.dy;
            const duration = isFlick
              ? Math.min(250, Math.max(50, remaining / gesture.vy))
              : 180;

            Animated.parallel([
              Animated.timing(translateY, {
                toValue: SHEET_HEIGHT,
                duration,
                useNativeDriver: true,
              }),
              Animated.timing(backdropOpacity, {
                toValue: 0,
                duration,
                useNativeDriver: true,
              }),
            ]).start(() => {
              onDismiss();
            });
          } else {
            animateTo(0);
          }
        },
      }),
    [translateY, backdropOpacity, onDismiss, animateTo]
  );

  const handleSettings = () => {
    router.push('/settings');
  };

  return (
    <Portal>
      <View style={[StyleSheet.absoluteFill, { pointerEvents: visible ? 'auto' : 'none' }]}>
        <TouchableWithoutFeedback onPress={onDismiss}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'black', opacity: backdropOpacity },
            ]}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handleBar} {...panResponder.panHandlers}>
            <View
              style={[
                styles.handle,
                { backgroundColor: theme.colors.outlineVariant },
              ]}
            />
          </View>

          <Text variant="titleLarge" style={styles.title}>
            Menu
          </Text>

          <Button mode="contained-tonal" onPress={onEnterLayoutMode} style={styles.button}>
            Customise layout
          </Button>

          <Button mode="contained-tonal" onPress={handleSettings} style={styles.button}>
            Settings
          </Button>

          <Button mode="outlined" onPress={onDismiss} style={styles.button}>
            Close
          </Button>
        </Animated.View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 48,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
  },
  handleBar: {
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: -24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  button: {
    width: '100%',
  },
});
