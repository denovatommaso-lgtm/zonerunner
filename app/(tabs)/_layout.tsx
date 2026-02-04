import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TabIcon from '@/components/common/TabIcon';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const barHeight = Platform.OS === 'ios' ? 62 : 58;
  const barPaddingBottom = Platform.OS === 'ios' ? 8 : 6;
  const barPaddingTop = 6;

  return (
    <Tabs
      initialRouteName="home"
      detachInactiveScreens={true}
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        tabBarSafeAreaInsets: { bottom: 0 },
        tabBarStyle: {
          backgroundColor: '#0a0f1f', // slightly brighter navy for the bottom bar
          borderTopColor: '#151b2a',
          height: barHeight,
          paddingBottom: barPaddingBottom,
          paddingTop: barPaddingTop,
          ...(Platform.OS === 'web'
            ? {
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
              }
            : null),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          paddingBottom: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#777',
        tabBarPressColor: '#1f2937',
        tabBarPressOpacity: 0.12,
        tabBarIcon: ({ color, size }) => {
          let iconName: 'home' | 'map' | 'trophy' | 'person' | 'time' | 'ellipse';

          if (route.name === 'home') {
            iconName = 'home';
          } else if (route.name === 'index') {
            iconName = 'map';
          } else if (route.name === 'leaderboard') {
            iconName = 'trophy';
          } else if (route.name === 'profile') {
            iconName = 'person';
          } else if (route.name === 'history') {
            iconName = 'time';
          } else {
            iconName = 'ellipse';
          }

          const resolvedSize = size ?? 22;
          return <TabIcon name={iconName} size={resolvedSize} color={color} />;
        },
      })}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
        }}
      />

      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />

      {/* Hide history from the bottom tab bar, but keep it as a route for "View all" */}
      <Tabs.Screen
        name="history"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
