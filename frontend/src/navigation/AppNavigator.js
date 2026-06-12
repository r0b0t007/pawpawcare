import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { colors, typography, radii } from '../theme';

import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import DashboardScreen from '../screens/main/DashboardScreen';
import PetsListScreen from '../screens/main/PetsListScreen';
import PetProfileScreen from '../screens/main/PetProfileScreen';
import AddPetScreen from '../screens/main/AddPetScreen';
import VaccinationTrackerScreen from '../screens/main/VaccinationTrackerScreen';
import CommunityScreen from '../screens/main/CommunityScreen';
import ScheduleScreen from '../screens/main/ScheduleScreen';
import NotificationsScreen from '../screens/main/NotificationsScreen';
import RemindersScreen from '../screens/main/RemindersScreen';
import LostPetsScreen from '../screens/main/LostPetsScreen';
import InvitesScreen from '../screens/main/InvitesScreen';
import MedicalRecordsScreen from '../screens/main/MedicalRecordsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="Home" component={DashboardScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Reminders" component={RemindersScreen} />
      <Stack.Screen name="Invites" component={InvitesScreen} />
    </Stack.Navigator>
  );
}

function CommunityStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="CommunityFeed" component={CommunityScreen} />
      <Stack.Screen name="LostPets" component={LostPetsScreen} />
    </Stack.Navigator>
  );
}

function PetsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="PetsList" component={PetsListScreen} />
      <Stack.Screen name="PetProfile" component={PetProfileScreen} />
      <Stack.Screen name="AddPet" component={AddPetScreen} />
      <Stack.Screen name="VaccinationTracker" component={VaccinationTrackerScreen} />
      <Stack.Screen name="MedicalRecords" component={MedicalRecordsScreen} />
    </Stack.Navigator>
  );
}

const TAB_ICONS = {
  Dashboard: { active: 'view-dashboard', inactive: 'view-dashboard-outline' },
  Pets: { active: 'paw', inactive: 'paw-outline' },
  Community: { active: 'forum', inactive: 'forum-outline' },
  Schedule: { active: 'account', inactive: 'account-outline' },
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
          backgroundColor: '#fffaf7',
          borderTopWidth: 1,
          borderTopColor: colors.surfaceContainerHighest,
          shadowColor: '#5a3500',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.07,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarActiveTintColor: colors.primaryContainer,
        tabBarInactiveTintColor: colors.outline,
        tabBarLabelStyle: {
          ...typography.labelSm,
          fontSize: 10,
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color }) => {
          const { active, inactive } = TAB_ICONS[route.name] || { active: 'help', inactive: 'help-circle-outline' };
          return (
            <View style={focused ? styles.activeIconWrap : null}>
              <MaterialCommunityIcons name={focused ? active : inactive} size={24} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Pets" component={PetsStack} options={{ tabBarLabel: 'Pets' }} />
      <Tab.Screen name="Community" component={CommunityStack} options={{ tabBarLabel: 'Community' }} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

const styles = {
  activeIconWrap: {
    backgroundColor: colors.primaryFixed,
    borderRadius: radii.lg,
    width: 48,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
};

export default function AppNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primaryContainer} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
    </Stack.Navigator>
  );
}
