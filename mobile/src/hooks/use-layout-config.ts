import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = '@spud:layout-config';

export interface ButtonOffset {
  x: number;
  y: number;
}

export interface KeyConfig {
  code: string;
  label: string;
  offset: ButtonOffset;
  storedPosition: { col: number; row: number };
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
  touchpadLeft: 8,
  touchpadRight: 36,
  keys: [
    { code: 'KeyW', label: 'W', offset: { x: 0, y: 0 }, storedPosition: { col: 1, row: 0 } },
    { code: 'KeyA', label: 'A', offset: { x: 0, y: 0 }, storedPosition: { col: 0, row: 1 } },
    { code: 'KeyS', label: 'S', offset: { x: 0, y: 0 }, storedPosition: { col: 1, row: 1 } },
    { code: 'KeyD', label: 'D', offset: { x: 0, y: 0 }, storedPosition: { col: 2, row: 1 } },
  ],
  keyZOrder: ['KeyW', 'KeyA', 'KeyS', 'KeyD'],
};

export function createDefaultConfig(): LayoutConfig {
  return {
    touchpadTop: 36,
    touchpadBottom: 36,
    touchpadLeft: 8,
    touchpadRight: 36,
    keys: [
      { code: 'KeyW', label: 'W', offset: { x: 0, y: 0 }, storedPosition: { col: 1, row: 0 } },
      { code: 'KeyA', label: 'A', offset: { x: 0, y: 0 }, storedPosition: { col: 0, row: 1 } },
      { code: 'KeyS', label: 'S', offset: { x: 0, y: 0 }, storedPosition: { col: 1, row: 1 } },
      { code: 'KeyD', label: 'D', offset: { x: 0, y: 0 }, storedPosition: { col: 2, row: 1 } },
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
              typeof parsed.keys[0].storedPosition === 'object';
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
