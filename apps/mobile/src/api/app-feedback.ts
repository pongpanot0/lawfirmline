import { File } from 'expo-file-system';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { ApiError, authenticatedFetch } from './client';

export type FeedbackKind = 'BUG' | 'SUGGESTION' | 'OTHER' | 'RATING';

export async function submitAppFeedback(input: {
  kind: FeedbackKind;
  route: string;
  message?: string;
  rating?: number;
  screenshot?: { uri: string; name: string; type: string };
}): Promise<{ id: string }> {
  const form = new FormData();
  form.append('kind', input.kind);
  form.append('route', input.route);
  form.append('platform', Platform.OS);
  if (Constants.expoConfig?.version) form.append('appVersion', Constants.expoConfig.version);
  if (input.message) form.append('message', input.message);
  if (input.rating) form.append('rating', String(input.rating));
  if (input.screenshot) {
    const file = input.screenshot;
    form.append('screenshot', {
      name: file.name,
      type: file.type,
      bytes: () => new File(file.uri).bytes(),
    } as unknown as Blob);
  }
  const response = await authenticatedFetch('/app-feedback', { method: 'POST', body: form });
  if (!response.ok) {
    let message = 'ส่งความเห็นไม่สำเร็จ กรุณาลองอีกครั้ง';
    try {
      const body = await response.json();
      if (typeof body?.message === 'string') message = body.message;
    } catch {
      // Keep the friendly fallback when the response is not JSON.
    }
    throw new ApiError(response.status, message);
  }
  return response.json() as Promise<{ id: string }>;
}
