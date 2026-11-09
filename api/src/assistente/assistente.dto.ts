import {
  IsIn,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const intents = [
  'ajuda',
  'pendencias',
  'valores',
  'variaveis',
  'erros',
  'comparacao',
  'financeiro',
  'km',
  'formulas',
  'esclarecer',
] as const;
export type Intent = (typeof intents)[number];
export const provedoresExternos = ['gpt', 'claude'] as const;
export type ProvedorExterno = (typeof provedoresExternos)[number];

export class AssistenteConfiguracaoDto {
  @IsBoolean()
  ativo!: boolean;

  @IsString()
  @Matches(/^claude-[a-z0-9-]{2,73}$/)
  modelo!: string;

  @IsOptional()
  @Length(16, 512, { message: 'Chave da Anthropic inválida.' })
  @Matches(/^sk-ant-[a-zA-Z0-9_-]+$/, {
    message: 'Chave da Anthropic inválida.',
  })
  chave?: string;
}

export class AssistenteDto {
  @IsString()
  @Length(1, 500)
  pergunta!: string;

  @IsOptional()
  @IsIn(intents.filter((intent) => intent !== 'esclarecer'))
  consulta?: Intent;

  @IsOptional()
  @IsIn(['local', 'gpt', 'claude'])
  provedor?: 'local' | 'gpt' | 'claude';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  periodoId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  filialId?: number;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  @Matches(/^[\p{L}\p{N} .\/-]+$/u, { message: 'Matrícula inválida.' })
  matricula?: string;
}
