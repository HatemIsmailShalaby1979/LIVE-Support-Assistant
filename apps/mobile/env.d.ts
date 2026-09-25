// Expo inlines EXPO_PUBLIC_* variables at bundle time and polyfills
// process.env in the runtime; this declares the subset the app reads.
declare const process: {
  env: {
    readonly EXPO_PUBLIC_ENGINE_ORIGIN?: string;
  };
};
