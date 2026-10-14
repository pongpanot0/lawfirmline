import { AuthUser } from '@lawfirm/shared';
import { DrivePickerController } from './drive-picker.controller';

describe('DrivePickerController.folderSuggestions', () => {
  it('delegates to CaseDriveService with default drive/item', async () => {
    const user = { id: 'u1', firmId: 'f1' } as unknown as AuthUser;
    const caseDrive = { folderSuggestions: jest.fn().mockResolvedValue([]) };
    const controller = new DrivePickerController(caseDrive as never);

    await controller.folderSuggestions(user, { driveId: 'b!d', itemId: 'ROOT' });
    await controller.folderSuggestions(user, {});

    expect(caseDrive.folderSuggestions).toHaveBeenNthCalledWith(1, user, 'b!d', 'ROOT');
    expect(caseDrive.folderSuggestions).toHaveBeenNthCalledWith(2, user, 'me', 'root');
  });
});
