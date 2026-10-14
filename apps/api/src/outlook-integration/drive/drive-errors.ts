import { BadRequestException, ForbiddenException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { GraphApiError } from '../graph/graph-http';

export const DRIVE_DISCONNECTED_MESSAGE = 'ผู้ผูก folder ตัดการเชื่อมต่อแล้ว';

/** Thai guidance for a failed OneDrive call — shown in the case documents tab and returned by actions. */
export function driveErrorMessage(error: unknown): string {
  if (error instanceof GraphApiError) {
    if (error.status === 401) return 'การเชื่อมต่อ Microsoft หมดอายุ — เจ้าของบัญชีต้องเชื่อมต่อใหม่ที่หน้าตั้งค่า';
    if (error.status === 403) {
      return 'บัญชี Microsoft ที่ใช้ไม่มีสิทธิ์ในไฟล์/folder นี้ — ขอให้เจ้าของแชร์ให้ใน OneDrive หรือใช้ "นำเข้าเป็นเอกสารคดี"';
    }
    if (error.status === 404) return 'ไม่พบไฟล์/folder นี้ใน OneDrive แล้ว (อาจถูกย้าย ลบ หรือเลิกแชร์) — ผูก folder ใหม่';
    if (error.status === 429 || error.status >= 500) return 'Microsoft ไม่ตอบสนองชั่วคราว — ลองใหม่อีกครั้งในอีกสักครู่';
  }
  if (error instanceof HttpException) return error.message;
  return 'เรียก OneDrive ไม่สำเร็จ';
}

/** Graph failure → matching Nest exception with Thai guidance; Nest exceptions pass through untouched. */
export function toDriveHttpError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const message = driveErrorMessage(error);
  if (error instanceof GraphApiError) {
    if (error.status === 403) return new ForbiddenException(message);
    if (error.status === 404) return new NotFoundException(message);
    if (error.status === 401) return new BadRequestException(message);
  }
  return new ServiceUnavailableException(message);
}

/** For `.catch(rethrowDriveError)` on Graph calls made inside request handlers. */
export function rethrowDriveError(error: unknown): never {
  throw toDriveHttpError(error);
}
