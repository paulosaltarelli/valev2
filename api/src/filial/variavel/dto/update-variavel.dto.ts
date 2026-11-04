import type { CreateVariavelDto } from './create-variavel.dto';

export type UpdateVariavelDto = Partial<CreateVariavelDto> & {
  ativa?: boolean;
};
