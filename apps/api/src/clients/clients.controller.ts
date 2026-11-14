import { CustomFieldValuesService } from '../custom-fields/custom-field-values.service';
import { SetCustomFieldValuesDto } from '../custom-fields/dto/custom-field-values.dto';
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
import { ClientsService } from './clients.service';
import { ClientContactDto, CreateClientDto, UpdateClientDto, ClientQueryDto } from './dto/client.dto';
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
    private customFieldValues: CustomFieldValuesService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ClientQueryDto) {
    return this.clientsService.findAll(user, query.search, query.cf);
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

  @Post(':id/contacts')
  @Roles(Role.ADMIN, Role.LAWYER)
  addContact(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ClientContactDto) {
    return this.clientsService.addContact(user, id, dto);
  }

  @Patch(':id/custom-fields')
  setCustomFields(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetCustomFieldValuesDto) {
    return this.customFieldValues.setValues(user, 'CLIENT', id, dto.values);
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

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clientsService.remove(user, id);
  }
}
