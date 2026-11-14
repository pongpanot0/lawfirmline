import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';

@Injectable()
export class DataImportMemberGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.switchToHttp().getRequest().user.firmRole === FirmRole.EXTERNAL) {
      throw new ForbiddenException('สมาชิกภายนอกนำเข้าข้อมูลไม่ได้');
    }
    return true;
  }
}
