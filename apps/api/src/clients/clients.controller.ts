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
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, Role } from '@lawfirm/shared';
import { ContactLineLinkService } from '../notifications/contact-line-link.service';
import { Client360Service } from './client-360.service';
import { LogClientContactDto } from './dto/contact-log.dto';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(
    private clientsService: ClientsService,
    private contactLineLink: ContactLineLinkService,
    private client360: Client360Service,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.clientsService.findAll(user, search);
  }

  @Get('contacts/:contactId/line-status')
  getContactLineStatus(@CurrentUser() user: AuthUser, @Param('contactId') contactId: string) {
    return this.contactLineLink.getStatusForStaff(user.firmId, contactId);
  }

  @Get(':id/overview')
  overview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.client360.overview(user, id);
  }

  @Post(':id/contact-logs')
  logContact(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LogClientContactDto) {
    return this.client360.logContact(user, id, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientsService.findOne(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.LAWYER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClientDto) {
    return this.clientsService.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.LAWYER)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(user, id, dto);
  }
}
