import { View, StyleSheet } from 'react-native';
import { ControllerButton } from './controller-button';

interface WasdPadProps {
  onKeyDown?: (key: string) => void;
  onKeyUp?: (key: string) => void;
}

export function WasdPad({ onKeyDown, onKeyUp }: WasdPadProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ControllerButton label="W" onPressIn={() => onKeyDown?.('w')} onPressOut={() => onKeyUp?.('w')} />
      </View>
      <View style={styles.row}>
        <ControllerButton label="A" onPressIn={() => onKeyDown?.('a')} onPressOut={() => onKeyUp?.('a')} />
        <ControllerButton label="S" onPressIn={() => onKeyDown?.('s')} onPressOut={() => onKeyUp?.('s')} />
        <ControllerButton label="D" onPressIn={() => onKeyDown?.('d')} onPressOut={() => onKeyUp?.('d')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
});
