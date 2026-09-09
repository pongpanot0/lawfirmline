import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AcceptIntakeFromThreadDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  relatedCaseId?: string;
}

export class ResolveFieldProposalDto {
  @IsIn(['confirm', 'reject'])
  action: 'confirm' | 'reject';

  /** Lawyer-edited value to confirm instead of the system's suggestion. */
  @IsOptional()
  @IsString()
  overrideValue?: string;
}

export class LinkThreadDto {
  @IsNotEmpty()
  @IsString()
  intakeId: string;
}

export class SeedMockReplyDto {
  @IsNotEmpty()
  @IsString()
  bodyText: string;

  @IsOptional()
  @IsString()
  fromName?: string;

  @IsOptional()
  @IsString()
  fromAddress?: string;
}
