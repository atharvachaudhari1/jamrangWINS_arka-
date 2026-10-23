import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jumpybrain.app',
  appName: 'Doorway',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
