import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = '@spud:layout-config';

export interface LayoutConfig {
  touchpadTop: number;
  touchpadBottom: number;
  touchpadLeft: number;
  touchpadRight: number;
  wasdOffsetX: number;
  wasdOffsetY: number;
}

export const defaultConfig: LayoutConfig = {
  touchpadTop: 36,
  touchpadBottom: 36,
  touchpadLeft: 8,
  touchpadRight: 36,
  wasdOffsetX: 0,
  wasdOffsetY: 0,
};

const memoryStore: Record<string, string> = {};

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return await AsyncStorage.getItem(key);
  } catch {
    return memoryStore[key] ?? null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(key, value);
  } catch {
    memoryStore[key] = value;
  }
}

export function useLayoutConfig() {
  const [config, setConfig] = useState<LayoutConfig>(defaultConfig);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          setConfig({ ...defaultConfig, ...JSON.parse(raw) });
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const saveConfig = useCallback(async (next: LayoutConfig) => {
    setConfig(next);
    await setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  return { config, loaded, saveConfig };
}
