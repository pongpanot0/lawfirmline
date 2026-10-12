import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { DocumentReviewQueueController } from './document-review-queue.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';

describe('DocumentReviewQueueController', () => {
  const reflector = new Reflector();
  const service = { listMine: jest.fn().mockResolvedValue([]), listForCase: jest.fn().mockResolvedValue([]) };
  const controller = new DocumentReviewQueueController(service as never);
  const user = { id: 'reviewer-1', firmId: 'firm-1' } as never;

  it('serves the two URLs the app calls', () => {
    expect(reflector.get(PATH_METADATA, controller.mine)).toBe('document-review/mine');
    expect(reflector.get(PATH_METADATA, controller.forCase)).toBe('cases/:caseId/review-rounds');
  });

  it('needs a signed-in user for both lists and case access for the case list', () => {
    expect(reflector.get(GUARDS_METADATA, DocumentReviewQueueController)).toEqual([JwtAuthGuard]);
    expect(reflector.get(GUARDS_METADATA, controller.forCase)).toEqual([CaseAccessGuard]);
    expect(reflector.get(GUARDS_METADATA, controller.mine)).toBeUndefined();
  });

  it('passes the caller and the case through', async () => {
    await controller.mine(user);
    expect(service.listMine).toHaveBeenCalledWith(user);
    await controller.forCase('case-1');
    expect(service.listForCase).toHaveBeenCalledWith('case-1');
  });
});
