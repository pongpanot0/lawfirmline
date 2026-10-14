import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class FolderLinkItemDto {
  @IsString()
  @IsNotEmpty()
  folderId: string;

  @IsString()
  @IsNotEmpty()
  caseId: string;
}

export class LinkFoldersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FolderLinkItemDto)
  links: FolderLinkItemDto[];
}
