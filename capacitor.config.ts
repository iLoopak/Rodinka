import type { CapacitorConfig } from '@capacitor/cli'

// Production config: loads the bundled `dist` build locally on-device, no
// `server.url`. For local dev with live reload against the Vite dev server,
// pass CAPACITOR_DEV_SERVER_URL (see docs/CAPACITOR_NATIVE_SETUP.md) — never
// set a remote server.url here, that would ship a web-view-to-a-website app
// instead of a native one.
const devServerUrl = process.env.CAPACITOR_DEV_SERVER_URL

const config: CapacitorConfig = {
  appId: 'cz.rodinka.app',
  appName: 'Rodinka',
  webDir: 'dist',
  backgroundColor: '#FFF8F2',
  ...(devServerUrl
    ? { server: { url: devServerUrl, cleartext: true } }
    : {}),
  android: {
    backgroundColor: '#FFF8F2',
  },
  ios: {
    backgroundColor: '#FFF8F2',
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#FFF8F2',
      showSpinner: false,
      launchAutoHide: false,
    },
    StatusBar: {
      // The WebView draws under the status bar (matching the installed PWA's
      // `viewport-fit=cover` fullscreen look), so the app's existing
      // `env(safe-area-inset-top)` CSS — already used throughout
      // `src/index.css` for the header/nav — is what actually reserves the
      // space, on both platforms, with no separate native treatment needed.
      overlaysWebView: true,
      // Dark icons/text: the brand background (#FFF8F2) is light.
      style: 'dark',
      backgroundColor: '#FFF8F2',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
}

export default config
