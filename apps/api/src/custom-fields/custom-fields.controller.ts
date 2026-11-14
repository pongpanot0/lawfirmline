import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto, CustomFieldQueryDto, OrderCustomFieldsDto, UpdateCustomFieldDto } from './dto/custom-field.dto';

@Controller('custom-fields')
@UseGuards(JwtAuthGuard)
export class CustomFieldsController {
  constructor(private customFields: CustomFieldsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: CustomFieldQueryDto) {
    return this.customFields.listVisible(user, query.entityKind, { includeArchived: query.includeArchived === 'true' });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomFieldDto) {
    return this.customFields.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.customFields.update(user, id, dto);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customFields.archive(user, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customFields.restore(user, id);
  }

  @Put('order')
  order(@CurrentUser() user: AuthUser, @Body() dto: OrderCustomFieldsDto) {
    return this.customFields.order(user, dto.ids);
  }
}
