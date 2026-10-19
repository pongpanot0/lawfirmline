import React from 'react';
import { ColorValue, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Tabs } from 'expo-router';
import { CalendarDays, LucideIcon, Plus, Scale, SquareCheckBig, Sun, Users } from 'lucide-react-native';
import { CHROME_MAX_SCALE, colors, fonts, radius, shadow, spacing, TOUCH } from '@/theme';
import { Text, useDisplayPreferences } from '@/components/AppText';

const PILL_WIDTH = 56;
const PILL_HEIGHT = 30;
// The library's tab button keeps its own 5pt padding on every side (tabVerticalUiKit); we add none on top.
const BUTTON_PAD = 5;
// Gap between the pill and its label.
const LABEL_GAP = 3;
// Headroom for Android's taller Thai font metrics and the bar's hairline top border.
const METRICS_SLACK = 4;

/** The selected tab sits on a tinted pill with a heavier stroke, so the state reads without relying on colour alone. */
function TabIcon({ Icon, color, size, focused }: { Icon: LucideIcon; color: ColorValue; size: number; focused: boolean }) {
  return <View style={{ width: PILL_WIDTH, height: PILL_HEIGHT, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center',
    backgroundColor: focused ? colors.infoSoft : 'transparent' }}>
    <Icon color={color as string} size={Math.min(size, 24)} strokeWidth={focused ? 2.4 : 1.8} />
  </View>;
}

export default function TabsLayout() {
  const { scale } = useDisplayPreferences();
  const insets = useSafeAreaInsets();
  // Tab labels are fixed chrome: cap the combined scale so five Thai labels never truncate at 320pt.
  const labelSize = 11 * Math.min(scale, CHROME_MAX_SCALE);
  // Thai stacks tone marks above and sara u/uu below the line, so the label gets a 1.5x line box.
  const labelLine = Math.ceil(labelSize * 1.5);
  // A numeric bar height is used as-is, so size it from what the button needs: 5 pad + 30 pill + 3 gap + label line
  // + 5 pad + 4 slack (64pt at the 17pt line), then add the bottom inset, which paddingBottom reserves below the items.
  const contentHeight = BUTTON_PAD + PILL_HEIGHT + LABEL_GAP + labelLine + BUTTON_PAD + METRICS_SLACK;
  const bottomPad = Math.max(insets.bottom, spacing.xs);
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: true,
        headerTintColor: colors.ink,
        // Same header face as the stack screens.
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 18 * scale },
        tabBarAllowFontScaling: false,
        // flexShrink 0: the button is a flex column, so a tight bar would otherwise squeeze the label and clip the glyphs.
        tabBarLabelStyle: { fontSize: labelSize, lineHeight: labelLine, marginTop: LABEL_GAP, fontWeight: '600', flexShrink: 0,
          textAlignVertical: 'center', ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}) },
        // The library's icon slot is a fixed 31x28; size it to the pill so the pill never overlaps the label.
        tabBarIconStyle: { width: PILL_WIDTH, height: PILL_HEIGHT },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, elevation: 0, ...shadow.md,
          height: contentHeight + bottomPad, paddingBottom: bottomPad },
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
