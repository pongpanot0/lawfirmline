import { IsDefined, IsObject } from 'class-validator';

export class SetCustomFieldValuesDto {
  @IsDefined()
  @IsObject()
  values!: Record<string, unknown>;
}
