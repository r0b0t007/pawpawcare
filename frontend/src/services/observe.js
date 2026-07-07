import { NavigationContainer } from '@react-navigation/native';

// expo-observe needs its ExpoAppMetrics native module, which real builds
// (dev client, EAS) include but Expo Go does not — importing it there throws
// at load time. Fall back to no-ops so the app still runs in Expo Go; nothing
// is lost, since metrics only dispatch from release builds anyway.
const noop = () => {};

let ObserveRoot = { wrap: (component) => component };
let ObserveNavigationContainer = NavigationContainer;
let useObserve = () => ({ markInteractive: noop });
let configureObserve = noop;

try {
  const observe = require('expo-observe');
  const integration = require('expo-observe/integrations/react-navigation');
  ObserveRoot = observe.ObserveRoot;
  ObserveNavigationContainer = integration.ObserveNavigationContainer;
  useObserve = observe.useObserve;
  configureObserve = (options) => observe.Observe.configure(options);
} catch (e) {
  console.log('[observe] native module unavailable (Expo Go) — metrics disabled');
}

export { ObserveRoot, ObserveNavigationContainer, useObserve, configureObserve };
