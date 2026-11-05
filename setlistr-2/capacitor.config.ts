import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.setlistr.mobile',
  appName: 'Setlistr',
  // Bundled with the binary: only the page shown when setlistr.ai can't load.
  webDir: 'native-shell',
  // App background (#0a0908) behind the WebView, so nothing flashes white
  // while https://setlistr.ai is loading.
  backgroundColor: '#0a0908',
  server: {
    url: 'https://setlistr.ai',
    // Shown instead of a blank screen when the site fails to load.
    errorPath: 'offline.html',
  },
  plugins: {
    // The splash reuses LaunchScreen.storyboard, so the iOS launch screen
    // and this overlay are the same logo on #0a0908. The web app hides it
    // as soon as it mounts (components/NativeSplashHide.tsx); the 5s
    // auto-hide is a safety net so a slow or failed load can't leave the
    // user stuck on the logo.
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 5000,
      launchFadeOutDuration: 200,
      backgroundColor: '#0a0908',
      showSpinner: false,
    },
  },
};

export default config;
