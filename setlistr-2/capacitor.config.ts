import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.setlistr.app',
  appName: 'Setlistr',
  webDir: 'out',
  server: {
    url: 'https://setlistr.ai',
    cleartext: true,
  },
};

export default config;