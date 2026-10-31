import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DailyBriefService } from './daily-brief.service';

@Injectable()
export class DailyBriefScheduler {
  private readonly logger = new Logger(DailyBriefScheduler.name);

  constructor(private readonly brief: DailyBriefService) {}

  @Cron('30 7 * * *', { timeZone: 'Asia/Bangkok' })
  async run() {
    try {
      await this.brief.runAll(new Date());
    } catch (err) {
      this.logger.error(`daily brief run failed: ${err}`);
    }
  }
}
