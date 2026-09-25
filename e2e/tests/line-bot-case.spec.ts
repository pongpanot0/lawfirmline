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

test('create a Case directly via the LINE webhook conversation', async ({ request }) => {
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
  const lawyersResponse = await request.get(`${API}/users/lawyers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(lawyersResponse.ok()).toBeTruthy();
  const lawyers = await lawyersResponse.json() as Array<{ firstName: string; lastName: string }>;
  expect(lawyers.length).toBeGreaterThan(0);

  const uniqueTitle = `E2E LINE Case ${Date.now()}`;

  await postWebhook('เมนู'); // trigger main menu
  await postWebhook('สร้าง Case'); // select create-case flow
  await postWebhook(uniqueTitle); // case title
  await postWebhook('ไม่มีลูกความแบบนี้'); // client search miss, treated as free-text name
  await postWebhook('ข้าม'); // skip description
  await postWebhook(`${lawyers[0].firstName} ${lawyers[0].lastName}`); // lead lawyer
  await postWebhook('พอแล้ว'); // no buddies
  await postWebhook('ข้าม'); // no deadline
  await postWebhook('ยืนยัน'); // confirm creation

  const cases = await request.get(`${API}/cases?search=${encodeURIComponent(uniqueTitle)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(cases.ok()).toBeTruthy();
  const items = await cases.json() as Array<{ title: string; intake?: unknown }>;
  expect(
    items.some((item) => item.title === uniqueTitle && !item.intake),
  ).toBeTruthy();
});
