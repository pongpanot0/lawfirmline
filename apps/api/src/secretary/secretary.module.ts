import { Module } from '@nestjs/common';
import { MatterBriefService } from './matter-brief.service';
import { SecretaryController } from './secretary.controller';

// PrismaModule and CommonModule (CaseAccessService/Guard) are @Global.
@Module({ controllers: [SecretaryController], providers: [MatterBriefService], exports: [MatterBriefService] })
export class SecretaryModule {}
