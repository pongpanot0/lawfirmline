import { Body, Controller, Get, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AiTrayService } from './ai-tray.service';

class MarkHandledDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('4', { each: true }) documentIds!: string[];
}

@Controller('ai-tray')
@UseGuards(JwtAuthGuard)
export class AiTrayController {
  constructor(private readonly service: AiTrayService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('caseId', new ParseUUIDPipe({ optional: true })) caseId?: string) {
    return this.service.list(u, caseId);
  }

  @Post('documents/handled')
  markHandled(@CurrentUser() u: AuthUser, @Body() dto: MarkHandledDto) {
    return this.service.markHandled(u, dto.documentIds);
  }
}
