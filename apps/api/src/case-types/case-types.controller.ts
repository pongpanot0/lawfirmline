import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CaseTypesService } from './case-types.service';
import { CreateCaseTypeDto, UpdateCaseTypeDto } from './dto/case-type.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser } from '@lawfirm/shared';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('case-types')
@UseGuards(JwtAuthGuard)
export class CaseTypesController {
  constructor(private caseTypesService: CaseTypesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('activeOnly') activeOnly?: string) {
    return this.caseTypesService.findAll(user, activeOnly === 'true');
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.caseTypesService.findOne(user, id);
  }

  @Post()
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCaseTypeDto) {
    return this.caseTypesService.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCaseTypeDto) {
    return this.caseTypesService.update(user, id, dto);
  }

  @Delete(':id')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.caseTypesService.remove(user, id);
  }
}
