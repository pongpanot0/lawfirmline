import { ArgumentsHost, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import { Response } from 'express';

/**
 * Multer's `limits.fileSize` rejects an oversized upload before any handler
 * runs, with the English "File too large". Every upload form in the app shows
 * the server's message verbatim, so the copy is translated here, once.
 */
@Catch(PayloadTooLargeException)
export class PayloadTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(413).json({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'ไฟล์มีขนาดใหญ่เกินที่กำหนด',
    });
  }
}
