import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UpdatePreferencesDto } from './dto/user-preferences.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, AuthUser } from '@lawfirm/shared';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN)
  findAll(@CurrentUser() user: AuthUser) {
    return this.usersService.findAll(user.firmId);
  }

  @Get('lawyers')
  findLawyers(@CurrentUser() user: AuthUser) {
    return this.usersService.findLawyers(user.firmId);
  }

  @Get('members')
  findMembers(@CurrentUser() user: AuthUser) {
    return this.usersService.findMembers(user.firmId);
  }

  /** The caller's own notification preferences — no admin role needed. */
  @Get('me/preferences')
  getMyPreferences(@CurrentUser() user: AuthUser) {
    return this.usersService.getPreferences(user.id);
  }

  @Patch('me/preferences')
  updateMyPreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.usersService.updatePreferences(user.id, dto);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(user.firmId, id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.firmId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove() {
    return this.usersService.remove();
  }
}
