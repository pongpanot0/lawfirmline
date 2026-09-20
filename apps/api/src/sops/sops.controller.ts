import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { OwnerOnly } from '../saas/decorators/saas.decorators';
import { SopsService } from './sops.service';

class SopDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(50000) content!: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
}

class UpdateSopDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(50000) content?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
}

@Controller('sops')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
export class SopsController {
  constructor(private sopsService: SopsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.sopsService.list(user, q);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sopsService.findOne(user, id);
  }

  @Post()
  @OwnerOnly()
  create(@CurrentUser() user: AuthUser, @Body() dto: SopDto) {
    return this.sopsService.create(user, dto);
  }

  @Patch(':id')
  @OwnerOnly()
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSopDto) {
    return this.sopsService.update(user, id, dto);
  }

  @Delete(':id')
  @OwnerOnly()
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sopsService.remove(user, id);
  }
}
