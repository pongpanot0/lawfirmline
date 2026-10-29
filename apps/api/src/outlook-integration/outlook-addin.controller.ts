import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OutlookAddinService } from './outlook-addin.service';
import { AddinFileDto, AddinSuggestDto } from './dto/outlook-addin.dto';

@Controller('outlook/addin')
@UseGuards(JwtAuthGuard)
export class OutlookAddinController {
  constructor(private service: OutlookAddinService) {}

  @Post('file')
  file(@CurrentUser() user: AuthUser, @Body() dto: AddinFileDto) {
    return this.service.file(user, dto);
  }

  @Post('suggest')
  suggest(@CurrentUser() user: AuthUser, @Body() dto: AddinSuggestDto) {
    return this.service.suggest(user, dto);
  }
}
