import { useState, useCallback } from 'react';
import { StatusBar, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

export function useImmersiveMode() {
  const [isImmersive, setIsImmersive] = useState(true);

  const enterImmersive = useCallback(async () => {
    setIsImmersive(true);
    StatusBar.setHidden(true);
    if (Platform.OS === 'android') {
      await NavigationBar.setVisibilityAsync('hidden');
    }
  }, []);

  const exitImmersive = useCallback(async () => {
    setIsImmersive(false);
    StatusBar.setHidden(false);
    if (Platform.OS === 'android') {
      await NavigationBar.setVisibilityAsync('visible');
    }
  }, []);

  return { isImmersive, enterImmersive, exitImmersive };
}
