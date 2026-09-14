import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Current soft-keyboard height in px. Android edge-to-edge (SDK 56) neither
 * resizes the window nor satisfies KeyboardAvoidingView until the next native
 * build picks up adjustResize, so screens pad themselves by this instead —
 * works on any build. Returns 0 on iOS, where KeyboardAvoidingView is fine.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
