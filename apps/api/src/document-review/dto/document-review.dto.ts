import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateReviewRoundDto {
  @IsNotEmpty()
  @IsString()
  documentVersionId: string;

  @ArrayNotEmpty()
  @IsArray()
  @IsString({ each: true })
  reviewerIds: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  editorIds?: string[];

  @IsOptional()
  @IsIn(['ALL', 'ANY_ONE'])
  approvalRule?: 'ALL' | 'ANY_ONE';

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class ReviewDecisionDto {
  @IsIn(['approve', 'return'])
  action: 'approve' | 'return';

  /** Required when action is "return". */
  @IsOptional()
  @IsString()
  reason?: string;

  /**
   * The document-version id the reviewer had open. Rejected if it no longer
   * matches the round's current version (stale-page protection).
   */
  @IsNotEmpty()
  @IsString()
  reviewedDocumentVersionId: string;
}
