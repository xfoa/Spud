import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@spud:layout-config';

export interface LayoutConfig {
  touchpadScale: number;
  wasdOffsetX: number;
  wasdOffsetY: number;
}

const defaultConfig: LayoutConfig = {
  touchpadScale: 1.0,
  wasdOffsetX: 0,
  wasdOffsetY: 0,
};

export function useLayoutConfig() {
  const [config, setConfig] = useState<LayoutConfig>(defaultConfig);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          setConfig({ ...defaultConfig, ...JSON.parse(raw) });
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const saveConfig = useCallback(async (next: LayoutConfig) => {
    setConfig(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  return { config, loaded, saveConfig };
}
