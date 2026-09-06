import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IntelligenceController } from './intelligence.controller';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { PrismaService } from '../prisma/prisma.module';
import { REQUIRE_CREDITS_KEY } from '../common/decorators/require-credits.decorator';

describe('IntelligenceController', () => {
  let controller: IntelligenceController;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntelligenceController],
      providers: [
        { provide: DocumentIntelligenceService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaseAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(IntelligenceController);
    reflector = module.get(Reflector);
  });

  it('requires 5 AI credits on extractDates, matching analyze', () => {
    expect(reflector.get(REQUIRE_CREDITS_KEY, controller.analyze)).toBe(5);
    expect(reflector.get(REQUIRE_CREDITS_KEY, controller.extractDates)).toBe(5);
  });
});
