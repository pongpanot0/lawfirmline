import { IsIn } from 'class-validator';

export class DecideLeaveDto {
  @IsIn(['APPROVED', 'REJECTED'], { message: 'ผลการพิจารณาต้องเป็นอนุมัติหรือไม่อนุมัติ' })
  decision!: 'APPROVED' | 'REJECTED';
}
