import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/** Emails allowed to change data every firm shares; unset means nobody. */
export function platformAdminEmails(env = process.env.PLATFORM_ADMIN_EMAILS): Set<string> {
  return new Set((env ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

/**
 * Courts, public holidays and statutory deadline rules are shared by every
 * firm. A firm OWNER passes `@Roles(Role.ADMIN)` (and self sign-up makes
 * owners ADMIN), so that role cannot guard platform data — only the
 * operator's own accounts, listed in PLATFORM_ADMIN_EMAILS, can.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const email = context.switchToHttp().getRequest().user?.email?.toLowerCase();
    if (email && platformAdminEmails().has(email)) return true;
    throw new ForbiddenException('ข้อมูลส่วนกลางแก้ได้เฉพาะผู้ดูแลระบบ');
  }
}
