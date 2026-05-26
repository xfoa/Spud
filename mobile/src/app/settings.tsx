import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, useTheme, Text } from 'react-native-paper';
import { router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function SettingsScreen() {
  const theme = useTheme();

  useEffect(() => {
    ScreenOrientation.unlockAsync();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Settings" />
      </Appbar.Header>

      <View style={styles.content}>
        <Text variant="bodyLarge" style={{ color: theme.colors.onBackground }}>
          Settings will appear here.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
});
