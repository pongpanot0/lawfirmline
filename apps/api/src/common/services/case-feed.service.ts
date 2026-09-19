import { Injectable, Logger } from '@nestjs/common';
import { ActivityType } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';

/**
 * ผู้เขียน activity feed ของคดีแบบอัตโนมัติ
 *
 * ก่อนหน้านี้ `CaseActivity` ถูกเขียนเฉพาะตอนที่คนกรอกเอง (และ `CaseActivitiesService`
 * ยังสร้าง calendar event ควบไปด้วย) ทำให้ timeline ของคดีตอบไม่ได้ว่าใครเปลี่ยน
 * สถานะ ย้ายขั้นตอน หรืออัปโหลดเอกสารเมื่อไร. คลาสนี้เขียนเฉพาะแถว activity
 * ไม่แตะปฏิทิน และพึ่ง Prisma อย่างเดียวจึงเรียกได้จากทุก service ที่เปลี่ยน state
 * ของคดีโดยไม่เกิด circular dependency.
 *
 * การลง feed ไม่ควรทำให้การกระทำหลักล้มเหลว — log แล้วปล่อยผ่าน
 */
@Injectable()
export class CaseFeedService {
  private readonly logger = new Logger(CaseFeedService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: {
    caseId: string;
    userId: string;
    type: ActivityType;
    title: string;
    description?: string;
    at?: Date;
  }) {
    try {
      await this.prisma.caseActivity.create({
        data: {
          caseId: params.caseId,
          title: params.title,
          description: params.description,
          activityAt: params.at ?? new Date(),
          type: params.type as never,
          createdById: params.userId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `ลง activity feed ของคดี ${params.caseId} ไม่สำเร็จ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
