import { buildCarouselMessage, buildHomeImagemap, linePublicBaseUrl } from './line-messaging.service';

describe('linePublicBaseUrl', () => {
  it('uses a public https API URL', () => {
    expect(linePublicBaseUrl('https://api.example.com/')).toBe('https://api.example.com');
  });

  it('falls back when the API URL is local or not https', () => {
    expect(linePublicBaseUrl(undefined)).toBe('https://api.samnuan.com');
    expect(linePublicBaseUrl('http://localhost:3001')).toBe('https://api.samnuan.com');
    expect(linePublicBaseUrl('https://localhost:3001')).toBe('https://api.samnuan.com');
  });
});

describe('buildHomeImagemap', () => {
  it('builds a single full-screen LINE imagemap: three cards plus a menu zone', () => {
    const message = buildHomeImagemap('https://dating-scouts-liking.ngrok-free.dev/');

    expect(message).toEqual({
      type: 'imagemap',
      baseUrl: 'https://dating-scouts-liking.ngrok-free.dev/line-assets/home-v2',
      altText: 'เมนู',
      baseSize: { width: 1040, height: 1040 },
      actions: [
        { type: 'message', text: 'สร้าง Case', area: { x: 0, y: 640, width: 347, height: 400 } },
        { type: 'message', text: 'เพิ่ม Task', area: { x: 347, y: 640, width: 346, height: 400 } },
        { type: 'message', text: 'สร้าง Todo', area: { x: 693, y: 640, width: 347, height: 400 } },
        { type: 'message', text: 'เมนู', area: { x: 0, y: 0, width: 1040, height: 640 } },
      ],
    });
  });

  it('carries quick replies, using postback actions when a payload is given', () => {
    const message = buildHomeImagemap('https://example.test', [
      { label: 'เมนู', text: 'เมนู' },
      { label: 'คดี A', text: 'คดี A', data: 'pick:c1' },
    ]) as any;

    expect(message.quickReply.items).toEqual([
      { type: 'action', action: { type: 'message', label: 'เมนู', text: 'เมนู' } },
      {
        type: 'action',
        action: { type: 'postback', label: 'คดี A', data: 'pick:c1', displayText: 'คดี A' },
      },
    ]);
  });
});

describe('buildCarouselMessage', () => {
  it('builds a LINE card carousel without images', () => {
    const message = buildCarouselMessage('สวัสดีครับ ผมลอว์', [
      {
        title: 'สร้าง Case',
        text: 'เปิด Case ใหม่จากไลน์',
        imageUrl: 'https://unused.example/case.jpg',
        actionLabel: 'สร้าง Case',
        actionText: 'สร้าง Case',
      },
    ]);

    expect(message).toEqual({
      type: 'template',
      altText: 'สวัสดีครับ ผมลอว์',
      template: {
        type: 'carousel',
        columns: [
          {
            title: 'สร้าง Case',
            text: 'เปิด Case ใหม่จากไลน์',
            actions: [{ type: 'message', label: 'สร้าง Case', text: 'สร้าง Case' }],
          },
        ],
      },
    });
  });
});
