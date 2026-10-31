import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const GRAPH_ID = /^[A-Za-z0-9!_-]+$/;

export class LinkDriveFolderDto {
  @IsString()
  @Matches(GRAPH_ID)
  driveId!: string;

  @IsString()
  @Matches(GRAPH_ID)
  itemId!: string;
}

export class CreateDriveFolderDto {
  @IsString()
  @Matches(GRAPH_ID)
  driveId!: string;

  @IsString()
  @Matches(GRAPH_ID)
  parentId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class DriveChildrenQueryDto {
  @IsOptional()
  @Matches(GRAPH_ID)
  driveId?: string;

  @IsOptional()
  @Matches(GRAPH_ID)
  itemId?: string;
}

export class SiteSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}
