import React from 'react';
import { ColorValue, Pressable, View } from 'react-native';
import { router, Tabs } from 'expo-router';
import { CalendarDays, LucideIcon, Plus, Scale, SquareCheckBig, Sun, Users } from 'lucide-react-native';
import { CHROME_MAX_SCALE, colors, fonts, radius, shadow, spacing, TOUCH } from '@/theme';
import { Text, useDisplayPreferences } from '@/components/AppText';

/** The selected tab sits on a tinted pill with a heavier stroke, so the state reads without relying on colour alone. */
function TabIcon({ Icon, color, size, focused }: { Icon: LucideIcon; color: ColorValue; size: number; focused: boolean }) {
  return <View style={{ width: 56, height: 30, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center',
    backgroundColor: focused ? colors.infoSoft : 'transparent' }}>
    <Icon color={color as string} size={Math.min(size, 24)} strokeWidth={focused ? 2.4 : 1.8} />
  </View>;
}

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
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, elevation: 0, ...shadow.md },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'วันนี้',
          tabBarIcon: props => <TabIcon Icon={Sun} {...props} />,
        }}
      />
      <Tabs.Screen
        name="cases"
        options={{
          title: 'คดี',
          tabBarIcon: props => <TabIcon Icon={Scale} {...props} />,
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
          tabBarIcon: props => <TabIcon Icon={CalendarDays} {...props} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'งาน',
          tabBarIcon: props => <TabIcon Icon={SquareCheckBig} {...props} />,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'ทีม',
          tabBarIcon: props => <TabIcon Icon={Users} {...props} />,
        }}
      />
    </Tabs>
  );
}
