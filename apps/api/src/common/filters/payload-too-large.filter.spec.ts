import { PayloadTooLargeException } from '@nestjs/common';
import { PayloadTooLargeFilter } from './payload-too-large.filter';

describe('PayloadTooLargeFilter', () => {
  it('answers 413 with Thai copy instead of multer\'s "File too large"', () => {
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json }) };
    const host = { switchToHttp: () => ({ getResponse: () => res }) } as any;
    new PayloadTooLargeFilter().catch(new PayloadTooLargeException('File too large'), host);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 413, message: 'ไฟล์มีขนาดใหญ่เกินที่กำหนด' }),
    );
  });
});
