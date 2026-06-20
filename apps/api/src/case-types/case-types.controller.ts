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
import { Role } from '@lawfirm/shared';

@Controller('case-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CaseTypesController {
  constructor(private caseTypesService: CaseTypesService) {}

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.caseTypesService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.caseTypesService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateCaseTypeDto) {
    return this.caseTypesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateCaseTypeDto) {
    return this.caseTypesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.caseTypesService.remove(id);
  }
}
