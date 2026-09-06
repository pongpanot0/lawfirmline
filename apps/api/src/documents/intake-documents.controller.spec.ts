import { Test, TestingModule } from '@nestjs/testing';
import { IntakeDocumentsController } from './intake-documents.controller';
import { DocumentsService } from './documents.service';

describe('IntakeDocumentsController', () => {
  let controller: IntakeDocumentsController;
  const mockService = {
    findByIntake: jest.fn(),
    uploadForIntake: jest.fn(),
    uploadNewVersionForIntake: jest.fn(),
    updateVisibilityForIntake: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntakeDocumentsController],
      providers: [{ provide: DocumentsService, useValue: mockService }],
    }).compile();
    controller = module.get(IntakeDocumentsController);
  });

  it('findByIntake delegates to the service with the current user and route intakeId', () => {
    const user = { id: 'user-1' } as any;
    controller.findByIntake(user, 'intake-1');
    expect(mockService.findByIntake).toHaveBeenCalledWith(user, 'intake-1');
  });

  it('upload delegates to uploadForIntake with the current user, intakeId, and file', () => {
    const user = { id: 'user-1' } as any;
    const file = { originalname: 'a.pdf' } as any;
    controller.upload(user, 'intake-1', file);
    expect(mockService.uploadForIntake).toHaveBeenCalledWith(user, 'intake-1', file);
  });

  it('updateVisibility delegates with the current user and visibleToClient flag from the body', () => {
    const user = { id: 'user-1' } as any;
    controller.updateVisibility(user, 'intake-1', 'doc-1', { visibleToClient: true });
    expect(mockService.updateVisibilityForIntake).toHaveBeenCalledWith(user, 'intake-1', 'doc-1', true);
  });
});
