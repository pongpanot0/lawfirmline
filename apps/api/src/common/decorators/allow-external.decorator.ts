import { SetMetadata } from '@nestjs/common';

export const ALLOW_EXTERNAL_KEY = 'allowExternal';

export const AllowExternal = () => SetMetadata(ALLOW_EXTERNAL_KEY, true);
