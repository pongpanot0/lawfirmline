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
