import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { ui } from '../theme';

import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
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
    </Stack.Navigator>
  );
}

const TAB_ICONS = {
  Dashboard: { active: 'home', inactive: 'home-outline' },
  Pets: { active: 'paw', inactive: 'paw-outline' },
  Health: { active: 'heart', inactive: 'heart-outline' },
  Community: { active: 'forum', inactive: 'forum-outline' },
  Profile: { active: 'account', inactive: 'account-outline' },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 80 : 66,
          paddingBottom: Platform.OS === 'ios' ? 20 : 10,
          paddingTop: 10,
          backgroundColor: '#fffdfa',
          borderTopWidth: 1,
          borderTopColor: '#f0e6d7',
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: ui.accent,
        tabBarInactiveTintColor: '#a08d72',
        tabBarLabelStyle: {
          fontFamily: 'PlusJakartaSans_600SemiBold',
          fontSize: 10,
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color }) => {
          const { active, inactive } = TAB_ICONS[route.name] || { active: 'help', inactive: 'help-circle-outline' };
          return <MaterialCommunityIcons name={focused ? active : inactive} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Pets" component={PetsStack} options={{ tabBarLabel: 'Pets' }} />
      <Tab.Screen name="Health" component={HealthStack} options={{ tabBarLabel: 'Health' }} />
      <Tab.Screen name="Community" component={CommunityStack} options={{ tabBarLabel: 'Community' }} />
      <Tab.Screen name="Profile" component={ProfileStack} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: ui.background }}>
        <ActivityIndicator size="large" color={ui.accent} />
      </View>
    );
  }

  return (
    // Login/logout swaps the whole tree — crossfade instead of a hard cut.
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {user ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
    </Stack.Navigator>
  );
}
