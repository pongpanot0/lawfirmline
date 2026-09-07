import { IsEnum, IsISO8601 } from 'class-validator';
import { DeadlineTrigger } from '@lawfirm/shared';

export class ApplyDeadlineTriggerDto {
  @IsEnum(DeadlineTrigger)
  trigger!: DeadlineTrigger;

  /** The date the clock starts, e.g. the day judgment was read. */
  @IsISO8601()
  triggerDate!: string;
}
