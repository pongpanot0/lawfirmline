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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role, AuthUser } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('case-types')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCaseTypeDto) {
    return this.caseTypesService.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCaseTypeDto) {
    return this.caseTypesService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.caseTypesService.remove(user, id);
  }
}
