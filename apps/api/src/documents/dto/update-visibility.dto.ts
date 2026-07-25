import { IsBoolean } from 'class-validator';

export class UpdateDocumentVisibilityDto {
  @IsBoolean()
  visibleToClient!: boolean;
}
