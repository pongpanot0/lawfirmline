import { CustomFieldValuesService } from './custom-field-values.service';
import { Global, Module } from '@nestjs/common';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';

@Global()
@Module({
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService, CustomFieldValuesService],
  exports: [CustomFieldsService, CustomFieldValuesService],
})
export class CustomFieldsModule {}
