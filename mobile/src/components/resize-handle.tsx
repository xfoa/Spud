import { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';

interface ResizeHandleProps {
  edge: 'top' | 'bottom' | 'left' | 'right';
  onResize: (dx: number, dy: number) => void;
  onGrant?: () => void;
  onRelease?: () => void;
}

export function ResizeHandle({ edge, onResize, onGrant, onRelease }: ResizeHandleProps) {
  const theme = useTheme();
  const startX = useRef(0);
  const startY = useRef(0);

  return (
    <View
      style={[
        styles.hitArea,
        styles[edge],
      ]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => {
        startX.current = e.nativeEvent.pageX;
        startY.current = e.nativeEvent.pageY;
        onGrant?.();
      }}
      onResponderMove={(e) => {
        const dx = e.nativeEvent.pageX - startX.current;
        const dy = e.nativeEvent.pageY - startY.current;
        startX.current = e.nativeEvent.pageX;
        startY.current = e.nativeEvent.pageY;
        onResize(dx, dy);
      }}
      onResponderRelease={onRelease}
      onResponderTerminate={onRelease}
    >
      <View
        style={[
          styles.bar,
          edge === 'top' || edge === 'bottom' ? styles.barHorizontal : styles.barVertical,
          { backgroundColor: theme.colors.primary },
        ]}
      />
    </View>
  );
}

const H = 6;
const L = 48;
const PADDING = 20;

const styles = StyleSheet.create({
  hitArea: {
    position: 'absolute',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bar: {
    borderRadius: H / 2,
    opacity: 0.9,
  },
  barHorizontal: {
    width: L,
    height: H,
  },
  barVertical: {
    width: H,
    height: L,
  },
  top: {
    top: -(PADDING + H / 2),
    left: '50%',
    marginLeft: -(L / 2 + PADDING),
    width: L + PADDING * 2,
    height: H + PADDING * 2,
  },
  bottom: {
    bottom: -(PADDING + H / 2),
    left: '50%',
    marginLeft: -(L / 2 + PADDING),
    width: L + PADDING * 2,
    height: H + PADDING * 2,
  },
  left: {
    left: -(PADDING + H / 2),
    top: '50%',
    marginTop: -(L / 2 + PADDING),
    width: H + PADDING * 2,
    height: L + PADDING * 2,
  },
  right: {
    right: -(PADDING + H / 2),
    top: '50%',
    marginTop: -(L / 2 + PADDING),
    width: H + PADDING * 2,
    height: L + PADDING * 2,
  },
});
