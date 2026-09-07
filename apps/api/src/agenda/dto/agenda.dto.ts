import { IsISO8601 } from 'class-validator';

export class AgendaRangeDto {
  /** Inclusive ISO start of the window. */
  @IsISO8601()
  from!: string;

  /** Exclusive ISO end of the window. */
  @IsISO8601()
  to!: string;
}
