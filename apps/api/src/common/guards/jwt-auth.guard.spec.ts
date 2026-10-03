import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirmRole } from '@lawfirm/shared';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ALLOW_EXTERNAL_KEY } from '../decorators/allow-external.decorator';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    guard = new JwtAuthGuard(reflector);
  });

  describe('handleRequest', () => {
    it('should deny EXTERNAL user on staff route without AllowExternal decorator', () => {
      const user = { id: 'user-1', firmRole: FirmRole.EXTERNAL };
      const mockContext = { getHandler: jest.fn(), getClass: jest.fn() };

      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      expect(() => {
        guard.handleRequest(null, user, null, null, mockContext as any);
      }).toThrow(ForbiddenException);
    });

    it('should allow EXTERNAL user on route with AllowExternal decorator', () => {
      const user = { id: 'user-1', firmRole: FirmRole.EXTERNAL };
      const mockContext = { getHandler: jest.fn(), getClass: jest.fn() };

      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

      const result = guard.handleRequest(null, user, null, null, mockContext as any);
      expect(result).toEqual(user);
    });

    it('should allow non-EXTERNAL users on staff routes', () => {
      const user = { id: 'user-1', firmRole: FirmRole.LAWYER };
      const mockContext = { getHandler: jest.fn(), getClass: jest.fn() };

      const result = guard.handleRequest(null, user, null, null, mockContext as any);
      expect(result).toEqual(user);
      expect(reflector.getAllAndOverride).not.toHaveBeenCalled();
    });

    it('should throw original auth error if user is null', () => {
      const err = new Error('No token');
      const mockContext = { getHandler: jest.fn(), getClass: jest.fn() };

      // Mock parent's handleRequest to throw
      jest.spyOn(Object.getPrototypeOf(guard), 'handleRequest').mockImplementation(() => {
        throw err;
      });

      expect(() => {
        guard.handleRequest(err, null, null, null, mockContext as any);
      }).toThrow(err);
    });
  });
});
