/**
 * The mobile shell.
 *
 * Same principle as the desktop shell: the engine — embedder, vector store,
 * gate, sync — is one web bundle; this shell hosts it and nothing else. The
 * WebView runs the identical code path the browser and the Tauri webview run,
 * which is the point of the monorepo: one engine, three platforms, one audit
 * trail.
 */
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

// Set EXPO_PUBLIC_ENGINE_ORIGIN at build time to the tenant's engine origin.
// Inlined by the Expo bundler, so there is no runtime configuration dependency.
const engineOrigin = process.env.EXPO_PUBLIC_ENGINE_ORIGIN ?? 'http://localhost:4174';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <WebView
        source={{ uri: engineOrigin }}
        style={styles.web}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
      />
      <Text style={styles.footer}>
        Engine origin: {engineOrigin}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  web: {
    flex: 1,
  },
  footer: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 6,
  },
});
