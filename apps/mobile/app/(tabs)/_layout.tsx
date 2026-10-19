import React from 'react';
import { Pressable } from 'react-native';
import { router, Tabs } from 'expo-router';
import { CalendarDays, Plus, Scale, SquareCheckBig, Sun, Users } from 'lucide-react-native';
import { CHROME_MAX_SCALE, colors, fonts, spacing, TOUCH } from '@/theme';
import { Text, useDisplayPreferences } from '@/components/AppText';

export default function TabsLayout() {
  const { scale } = useDisplayPreferences();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: true,
        headerTintColor: colors.ink,
        // Same header face as the stack screens.
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 18 * scale },
        // Tab labels are fixed chrome: cap the combined scale so five Thai labels never truncate at 320pt.
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: { fontSize: 11 * Math.min(scale, CHROME_MAX_SCALE), fontWeight: '600' },
        tabBarActiveTintColor: colors.ink,
        tabBarActiveBackgroundColor: colors.soft,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, elevation: 0 },
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
          // The list's only create action lives in the header, so search sits directly above the cases.
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="รับเคสใหม่" onPress={() => router.push('/case/new')}
              style={({ pressed }) => [{ minHeight: TOUCH, minWidth: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
                paddingHorizontal: spacing.lg }, pressed && { opacity: 0.6 }]}>
              <Plus size={18} color={colors.ink} />
              <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={{ color: colors.ink, fontWeight: '600' }}>รับเคส</Text>
            </Pressable>
          ),
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
