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
import { CasesService } from './cases.service';
import { CreateCaseDto, UpdateCaseDto, CaseQueryDto } from './dto/case.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, Role } from '@lawfirm/shared';

@Controller('cases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CasesController {
  constructor(private casesService: CasesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: CaseQueryDto) {
    return this.casesService.findAll(user, query);
  }

  @Get(':id')
  @UseGuards(CaseAccessGuard)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casesService.findOne(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.LAWYER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCaseDto) {
    return this.casesService.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(CaseAccessGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCaseDto,
  ) {
    return this.casesService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @UseGuards(CaseAccessGuard)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casesService.remove(user, id);
  }
}
