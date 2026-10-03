import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class TaskRoutineDefinitionDto {
  @IsString() @MinLength(1) @MaxLength(2000) expectedOutput!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(500, { each: true }) checks!: string[];
  @IsIn(['NONE', 'ANY', 'PDF']) attachment!: 'NONE' | 'ANY' | 'PDF';
  @IsOptional() @IsString() @MaxLength(1000) sourceHint?: string;
  @IsOptional() @IsString() @MaxLength(300) exampleFilename?: string;
  @IsOptional() @IsString() @MaxLength(4000) sourceTemplate?: string;
  @IsOptional() @IsString() @MaxLength(6000) exampleOutput?: string;
  @IsOptional() @IsString() @MaxLength(2000) missingDocuments?: string;
}

export class TaskRoutineSourceDto {
  @IsUUID() releaseId!: string;
  @IsInt() @Min(0) @Max(49) stepIndex!: number;
}

export class TaskRoutineProgressDto {
  @IsDateString() expectedUpdatedAt!: string;
  @IsArray() @ArrayMaxSize(30) @ArrayUnique() @IsInt({ each: true }) @Min(0, { each: true }) @Max(29, { each: true }) completedChecks!: number[];
}
