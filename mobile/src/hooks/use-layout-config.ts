import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = '@spud:layout-config';

export interface KeyConfig {
  code: string;
  label: string;
  visualPosition: { x: number; y: number };
}

export interface LayoutConfig {
  touchpadTop: number;
  touchpadBottom: number;
  touchpadLeft: number;
  touchpadRight: number;
  keys: KeyConfig[];
  keyZOrder: string[];
}

export const defaultConfig: LayoutConfig = {
  touchpadTop: 36,
  touchpadBottom: 36,
  touchpadLeft: 0,
  touchpadRight: 36,
  keys: [
    { code: 'KeyW', label: 'W', visualPosition: { x: 80, y: 0 } },
    { code: 'KeyA', label: 'A', visualPosition: { x: 0, y: 80 } },
    { code: 'KeyS', label: 'S', visualPosition: { x: 80, y: 80 } },
    { code: 'KeyD', label: 'D', visualPosition: { x: 160, y: 80 } },
  ],
  keyZOrder: ['KeyW', 'KeyA', 'KeyS', 'KeyD'],
};

export function createDefaultConfig(): LayoutConfig {
  return {
    touchpadTop: 36,
    touchpadBottom: 36,
    touchpadLeft: 0,
    touchpadRight: 36,
    keys: [
      { code: 'KeyW', label: 'W', visualPosition: { x: 80, y: 0 } },
      { code: 'KeyA', label: 'A', visualPosition: { x: 0, y: 80 } },
      { code: 'KeyS', label: 'S', visualPosition: { x: 80, y: 80 } },
      { code: 'KeyD', label: 'D', visualPosition: { x: 160, y: 80 } },
    ],
    keyZOrder: ['KeyW', 'KeyA', 'KeyS', 'KeyD'],
  };
}

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
          try {
            const parsed = JSON.parse(raw) as LayoutConfig;
            const hasValidKeys =
              parsed.keys &&
              Array.isArray(parsed.keys) &&
              parsed.keys.length > 0 &&
              typeof parsed.keys[0].visualPosition === 'object';
            if (hasValidKeys) {
              setConfig({ ...defaultConfig, ...parsed });
            }
          } catch {
            // ignore invalid config
          }
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
