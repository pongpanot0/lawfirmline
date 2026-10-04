import React from 'react';
import { Tabs } from 'expo-router';
import { CalendarDays, Scale, SquareCheckBig, Sun, Users } from 'lucide-react-native';
import { colors } from '@/theme';
import { useDisplayPreferences } from '@/components/AppText';

export default function TabsLayout() {
  const { scale } = useDisplayPreferences();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerShadowVisible: false,
        headerTintColor: colors.surface,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 * scale },
        tabBarLabelStyle: { fontSize: 11 * scale, fontWeight: '600' },
        tabBarActiveTintColor: colors.ink,
        tabBarActiveBackgroundColor: colors.infoSoft,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, elevation: 8 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'วันนี้',
          tabBarIcon: ({ color, size }) => <Sun color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cases"
        options={{
          title: 'คดี',
          tabBarIcon: ({ color, size }) => <Scale color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'ปฏิทิน',
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'งาน',
          tabBarIcon: ({ color, size }) => <SquareCheckBig color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'ทีม',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
