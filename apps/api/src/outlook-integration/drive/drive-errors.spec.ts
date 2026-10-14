import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { GraphApiError } from '../graph/graph-http';
import { driveErrorMessage, toDriveHttpError } from './drive-errors';

describe('drive errors', () => {
  it('gives Thai guidance per Graph status', () => {
    expect(driveErrorMessage(new GraphApiError(403, 'x'))).toMatch(/ไม่มีสิทธิ์/);
    expect(driveErrorMessage(new GraphApiError(404, 'x'))).toMatch(/ไม่พบ/);
    expect(driveErrorMessage(new GraphApiError(401, 'x'))).toMatch(/เชื่อมต่อใหม่/);
    expect(driveErrorMessage(new GraphApiError(503, 'x'))).toMatch(/ชั่วคราว/);
    expect(driveErrorMessage(new Error('boom'))).toBe('เรียก OneDrive ไม่สำเร็จ');
  });

  it('maps Graph errors to Nest exceptions and passes Nest exceptions through', () => {
    expect(toDriveHttpError(new GraphApiError(403, 'x'))).toBeInstanceOf(ForbiddenException);
    expect(toDriveHttpError(new GraphApiError(404, 'x'))).toBeInstanceOf(NotFoundException);
    expect(toDriveHttpError(new GraphApiError(401, 'x'))).toBeInstanceOf(BadRequestException);
    expect(toDriveHttpError(new GraphApiError(500, 'x'))).toBeInstanceOf(ServiceUnavailableException);
    const conflict = new ConflictException('keep me');
    expect(toDriveHttpError(conflict)).toBe(conflict);
  });
});
