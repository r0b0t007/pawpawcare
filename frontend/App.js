import 'react-native-url-polyfill/auto';
import React, { useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
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

import { AuthProvider } from './src/context/AuthContext';
import { DataProvider } from './src/context/DataContext';
import { trackScreen } from './src/services/analytics';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
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
        <AuthProvider>
          <DataProvider>
            <NavigationContainer
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
            </NavigationContainer>
          </DataProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
