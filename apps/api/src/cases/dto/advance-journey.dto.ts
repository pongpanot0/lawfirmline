import { CaseStage } from '@lawfirm/shared';
import { IsIn, ValidateIf } from 'class-validator';

export class AdvanceJourneyDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn([CaseStage.APPEAL, CaseStage.SUPREME, CaseStage.CLOSING])
  toStage?: CaseStage;
}
