import React, { createContext, forwardRef, useContext, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text as NativeText, TextInput as NativeTextInput, TextProps, TextInputProps } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/theme';

export const TEXT_SIZES = [1, 1.2, 1.4, 1.6] as const;
const KEY = 'samnuan.display.text-size';
const Context = createContext({ scale: 1, setScale: (_scale: number) => {} });
export const KeyboardAccessoryContext = createContext<string | undefined>(undefined);

export function DisplayPreferences({ children }: { children: React.ReactNode }) {
  const [scale, setScaleState] = useState(1);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(value => {
      const saved = Number(value);
      if ((TEXT_SIZES as readonly number[]).includes(saved)) setScaleState(saved);
    }).catch(() => {}).finally(() => setReady(true));
  }, []);
  const setScale = (next: number) => {
    if (!(TEXT_SIZES as readonly number[]).includes(next)) return;
    setScaleState(next);
    AsyncStorage.setItem(KEY, String(next)).catch(() => Alert.alert('จำขนาดตัวอักษรไม่ได้', 'ปรับขนาดได้ในครั้งนี้ แต่ต้องเลือกใหม่เมื่อเปิดแอป'));
  };
  if (!ready) return null;
  return <Context.Provider value={{ scale, setScale }}>{children}</Context.Provider>;
}

export const useDisplayPreferences = () => useContext(Context);

export const Text = forwardRef<React.ElementRef<typeof NativeText>, TextProps>(function AppText(props, ref) {
  const { scale } = useDisplayPreferences();
  const style = StyleSheet.flatten(props.style);
  return <NativeText {...props} ref={ref} allowFontScaling={props.allowFontScaling ?? true}
    style={[{ color: colors.text }, props.style, { fontSize: (style?.fontSize ?? 15) * scale,
      ...(style?.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }]} />;
});

export const TextInput = forwardRef<React.ElementRef<typeof NativeTextInput>, TextInputProps>(function AppTextInput(props, ref) {
  const { scale } = useDisplayPreferences();
  const accessoryId = useContext(KeyboardAccessoryContext);
  const style = StyleSheet.flatten(props.style);
  return <NativeTextInput {...props} ref={ref} secureTextEntry={props.secureTextEntry ?? false}
    inputAccessoryViewID={props.inputAccessoryViewID ?? accessoryId}
    autoComplete={props.autoComplete ?? 'off'}
    textContentType={props.textContentType ?? (props.autoComplete && props.autoComplete !== 'off' ? undefined : 'none')}
    allowFontScaling={props.allowFontScaling ?? true}
    style={[{ color: colors.text }, props.style, { fontSize: (style?.fontSize ?? 16) * scale,
      ...(style?.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }]} />;
});
