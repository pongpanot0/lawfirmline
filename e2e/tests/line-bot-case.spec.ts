import { test, expect } from '@playwright/test';
import { createHmac } from 'crypto';

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
// Pre-seeded (apps/api/prisma/seed.ts) as linked to the admin@lawfirm.com user.
const TEST_LINE_USER_ID = process.env.E2E_LINE_TEST_USER_ID ?? 'U-e2e-test-line-user';

function webhookEvent(text: string, replyToken = 'e2e-reply-token') {
  return {
    destination: 'e2e',
    events: [
      {
        type: 'message',
        replyToken,
        source: { userId: TEST_LINE_USER_ID, type: 'user' },
        message: { type: 'text', text },
      },
    ],
  };
}

test('create a case (Intake) end-to-end via the LINE webhook conversation', async ({ request }) => {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    throw new Error(
      'LINE_CHANNEL_SECRET is not set in the test environment — cannot compute a valid webhook signature.',
    );
  }

  async function postWebhook(text: string) {
    const bodyStr = JSON.stringify(webhookEvent(text));
    const signature = createHmac('sha256', secret!).update(bodyStr).digest('base64');
    const res = await request.post(`${API}/line/webhook`, {
      data: bodyStr,
      headers: {
        'content-type': 'application/json',
        'x-line-signature': signature,
      },
    });
    expect(res.ok()).toBeTruthy();
  }

  const login = await request.post(`${API}/auth/login`, {
    data: { email: 'admin@lawfirm.com', password: 'password123' },
  });
  expect(login.ok()).toBeTruthy();
  const { accessToken } = await login.json();

  const uniqueTitle = `E2E LINE Case ${Date.now()}`;

  await postWebhook('เมนู'); // trigger main menu
  await postWebhook('สร้าง Case'); // select create-case flow
  await postWebhook(uniqueTitle); // case title
  await postWebhook('ไม่มีลูกความแบบนี้'); // client search miss, treated as free-text name
  await postWebhook('ข้าม'); // skip description
  await postWebhook('ยืนยัน'); // confirm creation

  const intakes = await request.get(`${API}/intake?search=${encodeURIComponent(uniqueTitle)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(intakes.ok()).toBeTruthy();
  const body = await intakes.json();
  const items = body.items ?? body;
  expect(
    items.some((i: { title: string; referralChannel: string }) =>
      i.title === uniqueTitle && i.referralChannel === 'LINE',
    ),
  ).toBeTruthy();
});
