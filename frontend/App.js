import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ObserveRoot, ObserveNavigationContainer, configureObserve } from './src/services/observe';
import { initSentry, registerNavigation, wrapRoot } from './src/services/sentry';

import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import { ToastHost } from './src/components';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import { track, trackScreen } from './src/services/analytics';
import { addNotificationResponseListener } from './src/services/notifications';
import AppNavigator from './src/navigation/AppNavigator';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from './src/config';
import { initI18n } from './src/i18n';

// Must run at module scope, before any screen mounts.
initSentry();
configureObserve({ integrations: { 'react-navigation': true } });

// i18n: importing src/i18n already initialised it in the device language;
// this loads the saved Language setting. Started here so the pref read
// overlaps font loading, and awaited before the first real render so a user
// who picked another language never sees a flash of the device one.
const i18nReady = initI18n();

// Configure Google Sign-In once. webClientId is the audience the backend
// verifies the ID token against; iosClientId wires the native iOS flow. Skip
// when unconfigured (dev/CI) so the SDK doesn't warn — the button then no-ops.
// Guarded require (the codebase's defensive native-module pattern): a static
// import throws at bundle-eval time on any binary without the native module
// (Expo Go, dev clients built before the social-login release), which would
// crash the whole app — email login included — before anything renders.
if (GOOGLE_WEB_CLIENT_ID) {
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    });
  } catch (_) {
    // Native module absent — SocialAuthButtons hides the Google button.
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 2 },
  },
});

function App() {
  const navRef = useNavigationContainerRef();
  const routeNameRef = useRef(null);

  // Notification tap → open the Notifications inbox. The payload's `screen`
  // (sent by both the server push and scheduleLocalReminders) names a screen
  // in the Dashboard stack. Kind is an enum for analytics — never content.
  useEffect(() => {
    const sub = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data ?? {};
      track('notification_opened', { kind: data.kind || 'reminder' });
      const screen = data.screen || 'Notifications';
      if (navRef.isReady()) {
        navRef.navigate('Main', { screen: 'Dashboard', params: { screen } });
      }
      // Cold-start taps land on Home before the container is ready — acceptable:
      // the unread bell dot on the Dashboard already points at the inbox.
    });
    return () => sub.remove();
  }, [navRef]);

  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    let alive = true;
    i18nReady.finally(() => {
      if (alive) setLanguageReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded || !languageReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fffaf6' }}>
        <ActivityIndicator size="large" color="#8a5300" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary onReset={() => queryClient.clear()}>
        <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DataProvider>
            <ObserveNavigationContainer
              ref={navRef}
              onReady={() => {
                registerNavigation(navRef);
                routeNameRef.current = navRef.getCurrentRoute()?.name;
                trackScreen(routeNameRef.current);
              }}
              onStateChange={() => {
                // Manual screen tracking: route NAMES only, never params/content.
                const current = navRef.getCurrentRoute()?.name;
                if (current && current !== routeNameRef.current) trackScreen(current);
                routeNameRef.current = current;
              }}
            >
              <StatusBar style="dark" backgroundColor="#fffaf6" />
              <AppNavigator />
              <ToastHost />
            </ObserveNavigationContainer>
          </DataProvider>
        </AuthProvider>
        </QueryClientProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(ObserveRoot.wrap(App));
