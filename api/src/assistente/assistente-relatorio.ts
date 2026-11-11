import { BadRequestException } from '@nestjs/common';
import { Type, plainToInstance } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
  validateSync,
} from 'class-validator';
import { Prisma } from '@prisma/client';
import { FiltroRelatorioDto } from './assistente.dto';
import type { Celula, ResultadoAssistente } from './assistente-tipos';

class MetricaDto {
  @IsIn(['contagem', 'soma', 'minimo', 'maximo'])
  operacao!: 'contagem' | 'soma' | 'minimo' | 'maximo';

  @IsString()
  @Length(0, 120)
  coluna!: string;
}

export class TransformacaoRelatorioDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FiltroRelatorioDto)
  filtros!: FiltroRelatorioDto[];

  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsString({ each: true })
  agrupar!: string[];

  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => MetricaDto)
  metricas!: MetricaDto[];

  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsString({ each: true })
  colunas!: string[];

  @IsOptional()
  @IsString()
  @Length(1, 120)
  ordenarPor?: string;

  @IsBoolean()
  decrescente!: boolean;

  @IsBoolean()
  grafico!: boolean;
}

export function validarTransformacao(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('O plano de relatório retornado é inválido.');
  const plano = plainToInstance(TransformacaoRelatorioDto, value);
  if (
    validateSync(plano, { whitelist: true, forbidNonWhitelisted: true }).length
  )
    throw new BadRequestException('O plano de relatório retornado é inválido.');
  return plano;
}

function decimal(valor: Celula) {
  if (valor === null) return null;
  if (!/^-?\d+(\.\d+)?$/.test(String(valor)))
    throw new BadRequestException('A coluna solicitada não é numérica.');
  return new Prisma.Decimal(valor);
}

export function transformarRelatorio(
  resultado: ResultadoAssistente,
  plano: TransformacaoRelatorioDto,
): ResultadoAssistente {
  if (!resultado.tabela) return resultado;
  if (
    resultado.tabela.parcial &&
    (plano.agrupar.length || plano.metricas.length)
  )
    throw new BadRequestException(
      'A base está parcial. Refine a consulta antes de agregar valores.',
    );
  const base = resultado.tabela;
  const indice = (coluna: string) => {
    const index = base.colunas.indexOf(coluna);
    if (index < 0)
      throw new BadRequestException(
        'Coluna não disponível para este relatório.',
      );
    return index;
  };
  plano.filtros.forEach((filtro) => indice(filtro.coluna));
  plano.agrupar.forEach(indice);
  for (const metrica of plano.metricas)
    if (metrica.operacao !== 'contagem') indice(metrica.coluna);
  if (plano.agrupar.length && !plano.metricas.length)
    throw new BadRequestException(
      'Informe uma métrica para agrupar o relatório.',
    );
  const linhas = base.linhas.filter((linha) =>
    plano.filtros.every((filtro) => {
      const valor = linha[indice(filtro.coluna)];
      if (filtro.operador === 'vazio') return valor === null;
      if (filtro.operador === 'igual')
        return (
          valor !== null &&
          String(valor).toLocaleLowerCase('pt-BR') ===
            filtro.valor.toLocaleLowerCase('pt-BR')
        );
      if (filtro.operador === 'diferente')
        return (
          valor !== null &&
          String(valor).toLocaleLowerCase('pt-BR') !==
            filtro.valor.toLocaleLowerCase('pt-BR')
        );
      if (filtro.operador === 'contem')
        return (
          valor !== null &&
          String(valor)
            .toLocaleLowerCase('pt-BR')
            .includes(filtro.valor.toLocaleLowerCase('pt-BR'))
        );
      const atual = decimal(valor);
      const comparado = decimal(filtro.valor);
      if (!atual || !comparado) return false;
      return filtro.operador === 'maior'
        ? atual.gt(comparado)
        : atual.lt(comparado);
    }),
  );
  let colunas = [...base.colunas];
  let dados = linhas;
  if (plano.metricas.length) {
    const grupos = new Map<string, { valores: Celula[]; linhas: Celula[][] }>();
    for (const linha of linhas) {
      const valores = plano.agrupar.map((coluna) => linha[indice(coluna)]);
      const chave = JSON.stringify(valores);
      const grupo = grupos.get(chave) ?? { valores, linhas: [] };
      grupo.linhas.push(linha);
      grupos.set(chave, grupo);
    }
    if (!linhas.length && !plano.agrupar.length)
      grupos.set('[]', { valores: [], linhas: [] });
    const nomes = plano.metricas.map((metrica) =>
      metrica.operacao === 'contagem'
        ? 'Contagem de registros'
        : metrica.operacao + ' de ' + metrica.coluna,
    );
    if (new Set(nomes).size !== nomes.length)
      throw new BadRequestException('Métricas repetidas no relatório.');
    colunas = [...plano.agrupar, ...nomes];
    dados = [...grupos.values()].map((grupo) => [
      ...grupo.valores,
      ...plano.metricas.map((metrica): Celula => {
        if (metrica.operacao === 'contagem') return grupo.linhas.length;
        const valores = grupo.linhas
          .map((linha) => decimal(linha[indice(metrica.coluna)]))
          .filter((v): v is Prisma.Decimal => v !== null);
        if (!valores.length) return null;
        const total = valores.reduce(
          (acc, valor) =>
            metrica.operacao === 'soma'
              ? acc.add(valor)
              : metrica.operacao === 'minimo'
                ? Prisma.Decimal.min(acc, valor)
                : Prisma.Decimal.max(acc, valor),
          metrica.operacao === 'soma' ? new Prisma.Decimal(0) : valores[0],
        );
        return total.toString();
      }),
    ]);
  }
  if (plano.colunas.length) {
    const indices = plano.colunas.map((coluna) => {
      const i = colunas.indexOf(coluna);
      if (i < 0) throw new BadRequestException('Projeção de coluna inválida.');
      return i;
    });
    dados = dados.map((linha) => indices.map((i) => linha[i]));
    colunas = plano.colunas;
  }
  if (plano.ordenarPor) {
    const i = colunas.indexOf(plano.ordenarPor);
    if (i < 0) throw new BadRequestException('Ordenação de coluna inválida.');
    dados.sort((a, b) => {
      if (a[i] === null) return b[i] === null ? 0 : 1;
      if (b[i] === null) return -1;
      const result = String(a[i]).localeCompare(String(b[i]), 'pt-BR', {
        numeric: true,
      });
      return plano.decrescente ? -result : result;
    });
  }
  const grafico =
    plano.grafico &&
    plano.agrupar.length === 1 &&
    plano.metricas.length === 1 &&
    colunas.includes(plano.agrupar[0]) &&
    colunas.length === 2 &&
    dados.length <= 30
      ? dados
          .filter(
            (linha) => linha[1] !== null && Number.isFinite(Number(linha[1])),
          )
          .map((linha) => ({
            rotulo: String(linha[0] ?? 'Sem informação'),
            valor: Number(linha[1]),
          }))
      : undefined;
  return {
    ...resultado,
    texto:
      'Relatório com ' +
      dados.length +
      ' linha(s), a partir de ' +
      base.linhas.length +
      ' registro(s) consultados.',
    detalhes: [
      resultado.detalhes,
      'Base de dados: ' + resultado.texto,
      plano.filtros.length
        ? 'Filtros adicionais: ' +
          plano.filtros
            .map((f) => [f.coluna, f.operador, f.valor].join(' '))
            .join(', ')
        : '',
      plano.agrupar.length ? 'Agrupado por ' + plano.agrupar.join(', ') : '',
      plano.metricas.length
        ? 'Agregações de relatório sobre registros existentes. Valores vazios não são convertidos em zero.'
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    tabela: { colunas, linhas: dados, parcial: base.parcial },
    grafico,
  };
}
