import { PaperProvider, Portal } from 'react-native-paper';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <PaperProvider>
      <Portal.Host>
        <StatusBar style="auto" hidden />
        <Slot />
      </Portal.Host>
    </PaperProvider>
  );
}
