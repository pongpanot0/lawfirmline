import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IntakeService } from './intake.service';
import {
  CreateIntakeDto,
  UpdateIntakeDto,
  AssessIntakeDto,
  DecideIntakeDto,
  NoticeDto,
  ConvertToCaseDto,
  IntakeQueryDto,
} from './dto/intake.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';

@Controller('intake')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntakeController {
  constructor(private intakeService: IntakeService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: IntakeQueryDto) {
    return this.intakeService.findAll(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.intakeService.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIntakeDto) {
    return this.intakeService.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIntakeDto,
  ) {
    return this.intakeService.update(user, id, dto);
  }

  @Post(':id/assess')
  assess(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssessIntakeDto,
  ) {
    return this.intakeService.assess(user, id, dto);
  }

  @Post(':id/decide')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideIntakeDto,
  ) {
    return this.intakeService.decide(user, id, dto);
  }

  @Post(':id/notice')
  issueNotice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: NoticeDto,
  ) {
    return this.intakeService.issueNotice(user, id, dto);
  }

  @Post(':id/convert')
  convertToCase(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConvertToCaseDto,
  ) {
    return this.intakeService.convertToCase(user, id, dto);
  }
}
