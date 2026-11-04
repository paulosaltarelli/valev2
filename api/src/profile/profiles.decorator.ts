import { SetMetadata } from '@nestjs/common';

export const PROFILES_KEY = 'profiles';

export function Profiles(...profiles: Array<'admin' | 'operator'>) {
  return SetMetadata(PROFILES_KEY, profiles);
}
