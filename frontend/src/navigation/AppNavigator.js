import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { ui } from '../theme';
import { useTranslation } from '../i18n';

import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ReconnectScreen from '../screens/auth/ReconnectScreen';
import DashboardScreen from '../screens/main/DashboardScreen';
import PetsListScreen from '../screens/main/PetsListScreen';
import PetProfileScreen from '../screens/main/PetProfileScreen';
import AddPetScreen from '../screens/main/AddPetScreen';
import EditPetScreen from '../screens/main/EditPetScreen';
import VaccinationTrackerScreen from '../screens/main/VaccinationTrackerScreen';
import CommunityScreen from '../screens/main/CommunityScreen';
import HealthHubScreen from '../screens/main/HealthHubScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import AccountDetailsScreen from '../screens/main/AccountDetailsScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import RemindersScreen from '../screens/main/RemindersScreen';
import LostPetsScreen from '../screens/main/LostPetsScreen';
import InvitesScreen from '../screens/main/InvitesScreen';
import MedicalRecordsScreen from '../screens/main/MedicalRecordsScreen';
import SupportScreen from '../screens/main/SupportScreen';
import ModerationScreen from '../screens/main/ModerationScreen';
import SubscriptionScreen from '../screens/main/SubscriptionScreen';
import PaywallScreen from '../screens/main/PaywallScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ui.background } }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ui.background } }}>
      <Stack.Screen name="Home" component={DashboardScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Reminders" component={RemindersScreen} />
      <Stack.Screen name="Invites" component={InvitesScreen} />
    </Stack.Navigator>
  );
}

function PetsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ui.background } }}>
      <Stack.Screen name="PetsList" component={PetsListScreen} />
      <Stack.Screen name="PetProfile" component={PetProfileScreen} />
      <Stack.Screen name="AddPet" component={AddPetScreen} />
      <Stack.Screen name="EditPet" component={EditPetScreen} />
      <Stack.Screen name="VaccinationTracker" component={VaccinationTrackerScreen} />
      <Stack.Screen name="MedicalRecords" component={MedicalRecordsScreen} />
    </Stack.Navigator>
  );
}

// The Health hub absorbs the old Schedule lists. The per-pet tracker, medical
// records and reminders screens stay registered here so hub rows can push
// them until phase 4 folds their content in.
function HealthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ui.background } }}>
      <Stack.Screen name="HealthHub" component={HealthHubScreen} />
      <Stack.Screen name="VaccinationTracker" component={VaccinationTrackerScreen} />
      <Stack.Screen name="MedicalRecords" component={MedicalRecordsScreen} />
      <Stack.Screen name="Reminders" component={RemindersScreen} />
    </Stack.Navigator>
  );
}

function CommunityStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ui.background } }}>
      <Stack.Screen name="CommunityFeed" component={CommunityScreen} />
      <Stack.Screen name="LostPets" component={LostPetsScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: ui.background } }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="Moderation" component={ModerationScreen} />
      <Stack.Screen name="Invites" component={InvitesScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
    </Stack.Navigator>
  );
}

// Tab labels shrink (down to 80%) rather than truncate: "Communauté" is too
// wide for a five-tab bar at 11px. The string stays the accessibility label.
const TAB_LABEL_STYLE = { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, marginTop: 2 };
const tabLabel = (text) => ({
  tabBarAccessibilityLabel: text,
  tabBarLabel: ({ color }) => (
    <Text style={[TAB_LABEL_STYLE, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
      {text}
    </Text>
  ),
});

const TAB_ICONS = {
  Dashboard: { active: 'home', inactive: 'home-outline' },
  Pets: { active: 'paw', inactive: 'paw-outline' },
  Health: { active: 'heart', inactive: 'heart-outline' },
  Community: { active: 'forum', inactive: 'forum-outline' },
  Profile: { active: 'account', inactive: 'account-outline' },
};

function MainTabs() {
  // The bar grows by the device's bottom inset (home indicator, Android's
  // gesture or 3-button bar) so labels never sit under system UI; a fixed
  // height would override React Navigation's own inset handling.
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          height: 60 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 6,
          backgroundColor: ui.surface,
          borderTopWidth: 1,
          borderTopColor: ui.border,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: ui.accent,
        // ui.sub, not a lighter beige: inactive labels must still pass AA.
        tabBarInactiveTintColor: ui.sub,
        tabBarIcon: ({ focused, color }) => {
          const { active, inactive } = TAB_ICONS[route.name] || { active: 'help', inactive: 'help-circle-outline' };
          return <MaterialCommunityIcons name={focused ? active : inactive} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} options={tabLabel(t('nav.tabs.home'))} />
      <Tab.Screen name="Pets" component={PetsStack} options={tabLabel(t('nav.tabs.pets'))} />
      <Tab.Screen name="Health" component={HealthStack} options={tabLabel(t('nav.tabs.health'))} />
      <Tab.Screen name="Community" component={CommunityStack} options={tabLabel(t('nav.tabs.community'))} />
      <Tab.Screen name="Profile" component={ProfileStack} options={tabLabel(t('nav.tabs.profile'))} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, isLoading, restoreFailed } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: ui.background }}>
        <ActivityIndicator size="large" color={ui.accent} />
      </View>
    );
  }

  // Saved session, server unreachable at launch: offer a retry rather than
  // the Welcome screen.
  if (restoreFailed && !user) return <ReconnectScreen />;

  return (
    // Login/logout swaps the whole tree — crossfade instead of a hard cut.
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          {/* Reachable from anywhere: navigation.navigate('Paywall', { feature }). */}
          <Stack.Screen
            name="Paywall"
            component={PaywallScreen}
            options={{ presentation: 'modal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: ui.background } }}
          />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
    </Stack.Navigator>
  );
}
