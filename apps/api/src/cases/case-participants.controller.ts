import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CaseParticipantsService } from './case-participants.service';
import { CreateParticipantDto, UpdateParticipantDto } from './dto/case.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';

@Controller('cases/:caseId/participants')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseParticipantsController {
  constructor(private participantsService: CaseParticipantsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.participantsService.findAll(user, caseId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateParticipantDto,
  ) {
    return this.participantsService.create(user, caseId, dto);
  }

  @Patch(':participantId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('participantId') participantId: string,
    @Body() dto: UpdateParticipantDto,
  ) {
    return this.participantsService.update(user, caseId, participantId, dto);
  }

  @Delete(':participantId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('participantId') participantId: string,
  ) {
    return this.participantsService.remove(user, caseId, participantId);
  }
}
