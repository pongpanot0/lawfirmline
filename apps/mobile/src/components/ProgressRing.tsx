import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/AppText';
import { CHROME_MAX_SCALE, colors, fonts } from '@/theme';

/** A progress ring with the count in its centre (the one signature element per screen, 2026-11-15 mockups). */
export function ProgressRing({ value, total, size = 72, stroke = 7, color = colors.ink, track = colors.soft, label }: {
  value: number; total: number; size?: number; stroke?: number; color?: string; track?: string; label?: string;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0;
  return <View accessible accessibilityLabel={label ?? `${value} จาก ${total}`} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - share)} />
    </Svg>
    <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={{ fontFamily: fonts.bold, fontSize: size * 0.26, lineHeight: size * 0.36, color, fontVariant: ['tabular-nums'] }}>
      {`${value}/${total}`}
    </Text>
  </View>;
}
