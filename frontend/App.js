import 'react-native-url-polyfill/auto';
import React, { useRef } from 'react';
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

import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import { trackScreen } from './src/services/analytics';
import AppNavigator from './src/navigation/AppNavigator';

// Must run at module scope, before any screen mounts.
configureObserve({ integrations: { 'react-navigation': true } });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 2 },
  },
});

function App() {
  const navRef = useNavigationContainerRef();
  const routeNameRef = useRef(null);

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff8f4' }}>
        <ActivityIndicator size="large" color="#855300" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DataProvider>
            <ObserveNavigationContainer
              ref={navRef}
              onReady={() => {
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
              <StatusBar style="dark" backgroundColor="#fff8f4" />
              <AppNavigator />
            </ObserveNavigationContainer>
          </DataProvider>
        </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default ObserveRoot.wrap(App);
