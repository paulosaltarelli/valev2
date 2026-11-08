import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  execucao,
  execucao_funcionario,
  execucao_funcionario_base,
  Prisma,
} from '@prisma/client';
import { FormulaService } from 'src/filial/formula/formula.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CalculatorService } from 'src/helpers/calculator/calculator.service';
import { analisarExpressao } from 'src/helpers/calculator/formula-expression';
import { RmService } from 'src/rm/rm.service';
import { formatQueueErrorLine } from 'src/utils/queueError';
import { OperacaoService } from './operacao.service';
import { isRmVariableFailureFinal, readRmVariable } from './rm-variable-result';
import { LimitedExecutor, variableConcurrency } from 'src/utils/limited-executor';

@Injectable()
export class ExecucaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formulaService: FormulaService,
    private readonly calculatorService: CalculatorService,
    private readonly rmService: RmService,
    private readonly operacao: OperacaoService,
  ) {}
  private readonly logger = new Logger(ExecucaoService.name);
  private readonly variableConcurrencyLimit = variableConcurrency();
  private readonly variableWorkers = new LimitedExecutor(this.variableConcurrencyLimit);

  // Status para exibição na tabela do frontend (nível "funcionário base")
  // Ideia: refletir o progresso do pipeline do funcionário dentro da execução.
  private static readonly STATUS_FUNC_BASE = {
    PREVIA: 'PREVIA',
    VARIAVEIS_PROCESSADAS: 'VARIAVEIS_PROCESSADAS',
    ERRO_VARIAVEIS: 'ERRO_VARIAVEIS',
    RESULTADOS_PROCESSADOS: 'RESULTADOS_PROCESSADOS',
    RESULTADOS_PARCIAL: 'RESULTADOS_PARCIAL',
    ERRO_RESULTADOS: 'ERRO_RESULTADOS',
    ENVIADO_RM: 'ENVIADO_RM',
    ERRO_RM: 'ERRO_RM',
  } as const;

  private formatRmDateOnly(dateLike: Date): string {
    // Evita problemas de timezone (ex.: voltar 1 dia).
    // O RM espera algo como: 2025-12-01T00:00:00-03:00
    const yyyyMmDd = dateLike.toISOString().slice(0, 10);
    return `${yyyyMmDd}T00:00:00-03:00`;
  }

  private extractRmInsertedId(rmResponse: unknown): number | null {
    // RM geralmente responde: { data: { id: "15", ... } }
    // mas pode variar em nesting dependendo do axios/serviço.
    try {
      if (!rmResponse || typeof rmResponse !== 'object') return null;
      const obj = rmResponse as Record<string, unknown>;

      const data = obj['data'];
      if (data && typeof data === 'object') {
        const dataObj = data as Record<string, unknown>;
        const idFromData = dataObj['id'];
        if (idFromData !== undefined && idFromData !== null) {
          const parsed = Number(idFromData);
          return Number.isFinite(parsed) ? parsed : null;
        }
        const tempId = dataObj['RESTDS_TEMP_ID'];
        if (tempId !== undefined && tempId !== null) {
          const parsed = Number(tempId);
          return Number.isFinite(parsed) ? parsed : null;
        }

        const nested = dataObj['data'];
        if (nested && typeof nested === 'object') {
          const nestedObj = nested as Record<string, unknown>;
          const idNested = nestedObj['id'];
          if (idNested !== undefined && idNested !== null) {
            const parsed = Number(idNested);
            return Number.isFinite(parsed) ? parsed : null;
          }
          const tempNested = nestedObj['RESTDS_TEMP_ID'];
          if (tempNested !== undefined && tempNested !== null) {
            const parsed = Number(tempNested);
            return Number.isFinite(parsed) ? parsed : null;
          }
        }
      }

      const idTop = obj['id'];
      if (idTop !== undefined && idTop !== null) {
        const parsed = Number(idTop);
        return Number.isFinite(parsed) ? parsed : null;
      }

      return null;
    } catch (error) {
      this.logger.error('Erro ao extrair id do RM', error);
      return null;
    }
  }

  private getFormulasAtivasDaExecucao(
    execucao: Prisma.execucaoGetPayload<{
      include: {
        filial: {
          include: {
            formula: {
              where: {
                ativa: true;
              };
            };
          };
        };
      };
    }>,
  ) {
    const formulas = execucao.filial?.formula ?? [];
    if (!formulas || formulas.length === 0) {
      throw new NotFoundException('Filial sem formulas ativas');
    }
    return formulas;
  }

  private getVariaveisFixas(
    execucao: Prisma.execucaoGetPayload<{
      include: { filial: { include: { variavel: true } } };
    }>,
  ): Record<string, number> {
    return execucao.filial.variavel
      .filter(
        (v) =>
          v.valor_fixo !== null &&
          v.valor_fixo !== undefined &&
          String(v.valor_fixo).trim() !== '',
      )
      .reduce(
        (acc, v) => {
          acc[v.codigo] = Number(v.valor_fixo);
          return acc;
        },
        {} as Record<string, number>,
      );
  }

  private extractCodesFromExpressao(expressao: string): Set<string> {
    return analisarExpressao(expressao).codigos;
  }

  private async getContextoVariaveis(execucaoId: number, baseIds?: number[]) {
    const execucao = await this.prisma.execucao.findUnique({
      where: { execucao_id: execucaoId },
      include: {
        filial: {
          include: {
            formula: {
              where: { ativa: true },
              orderBy: [{ nome: 'asc' }, { versao: 'desc' }],
            },
            variavel: true,
          },
        },
        periodo: true,
        execucao_funcionario_base: baseIds
          ? { where: { execucao_funcionario_base_id: { in: baseIds } } }
          : true,
      },
    });
    if (!execucao) throw new NotFoundException('Execucao not found');
    return execucao;
  }

  private async loadMemoriaScopeByExecucaoId(
    execucaoId: number,
  ): Promise<Map<number, Record<string, number>>> {
    const rows = await this.prisma.memoria_calculo.findMany({
      where: {
        execucao_funcionario: {
          execucao_id: execucaoId,
        },
      },
      select: {
        execucao_funcionario_id: true,
        variavel_codigo: true,
        valor: true,
      },
    });

    const map = new Map<number, Record<string, number>>();
    for (const row of rows) {
      const scope = map.get(row.execucao_funcionario_id) ?? {};
      scope[row.variavel_codigo] = Number(row.valor);
      map.set(row.execucao_funcionario_id, scope);
    }
    return map;
  }

  private async ensureResultadoPorFormula(params: {
    execucaoId: number;
    execucaoFuncionarioBaseId: number;
    funcionarioIdRm: string;
    formulaId: number;
  }) {
    const {
      execucaoId,
      execucaoFuncionarioBaseId,
      funcionarioIdRm,
      formulaId,
    } = params;

    // unique composto: (execucao_id, execucao_funcionario_base_id, formula_id)
    return await this.prisma.execucao_funcionario.upsert({
      where: {
        execucao_id_execucao_funcionario_base_id_formula_id: {
          execucao_id: execucaoId,
          execucao_funcionario_base_id: execucaoFuncionarioBaseId,
          formula_id: formulaId,
        },
      },
      create: {
        execucao_id: execucaoId,
        execucao_funcionario_base_id: execucaoFuncionarioBaseId,
        funcionario_id_rm: funcionarioIdRm,
        formula_id: formulaId,
        valor_calculado: null,
        valor_final: null,
        status: 'PREVIA',
        ajuste_manual: false,
      },
      update: {},
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async buildUserScopeBase(params: {
    execucao: Prisma.execucaoGetPayload<{
      include: {
        filial: { include: { variavel: true } };
        periodo: true;
      };
    }>;
    funcionarioBase: Prisma.execucao_funcionario_baseGetPayload<Prisma.execucao_funcionario_baseDefaultArgs>;
    variaveisFixas: Record<string, number>;
    execucaoFuncionarioId?: number;
    memoriaScopeByExecFuncId?: Map<number, Record<string, number>>;
    codigosNecessarios?: Set<string>;
  }): Promise<Record<string, number>> {
    const {
      execucao,
      funcionarioBase,
      variaveisFixas,
      execucaoFuncionarioId,
      memoriaScopeByExecFuncId,
      codigosNecessarios,
    } = params;
    void execucao;
    void funcionarioBase;

    const scope: Record<string, number> = {
      ...variaveisFixas,
    };

    // Se fornecido, carrega valores já calculados em `memoria_calculo` (sem consultar RM de novo).
    if (execucaoFuncionarioId && memoriaScopeByExecFuncId) {
      const mem = memoriaScopeByExecFuncId.get(execucaoFuncionarioId);
      if (mem) Object.assign(scope, mem);
    }

    // Para evitar erro do mathjs por variáveis ausentes, podemos inicializar faltantes com 0
    // (principalmente útil se `processarTodos` for chamado antes de `processarVariaveis`).
    if (codigosNecessarios && codigosNecessarios.size > 0) {
      for (const codigo of codigosNecessarios) {
        if (scope[codigo] === undefined) scope[codigo] = 0;
      }
    }

    return scope;
  }

  async getAllExecucoes(): Promise<execucao[]> {
    return this.prisma.execucao.findMany({
      include: {
        periodo: true,
        formula: true,
        usuario: true,
        filial: true,
      },
      where: {
        periodo: {
          ativo: true,
        },
      },
    });
  }

  async getAllExecucoesByFilialId(filialId: number): Promise<execucao[]> {
    if (filialId === 0)
      return this.prisma.execucao.findMany({
        include: {
          periodo: true,
          formula: true,
          usuario: true,
          filial: true,
        },
        where: {
          periodo: {
            ativo: true,
          },
        },
      });

    const execucoes = await this.prisma.execucao.findMany({
      where: { filial_id: filialId, periodo: { ativo: true } },
      include: {
        periodo: true,
        formula: true,
        usuario: true,
        filial: true,
      },
    });
    if (!execucoes) throw new NotFoundException('Execucoes not found');
    return execucoes;
  }

  async getExecucaoById(execucaoId: number, db: Prisma.TransactionClient = this.prisma): Promise<
    Prisma.execucaoGetPayload<{
      include: {
        filial: {
          include: {
            formula: true;
            variavel: true;
          };
        };
        periodo: true;
        usuario: true;
        execucao_funcionario_base: {
          include: {
            execucao_funcionario: {
              include: {
                formula: true;
                memoria_calculo: true;
              };
            };
          };
        };
      };
    }>
  > {
    const execucao = await db.execucao.findUnique({
      where: { execucao_id: execucaoId },
      include: {
        filial: {
          include: {
            formula: {
              where: { ativa: true },
              // Ordena por nome e, em seguida, pela versão mais recente
              orderBy: [{ nome: 'asc' }, { versao: 'desc' }],
            },
            variavel: true,
          },
        },
        periodo: true,
        usuario: true,
        execucao_funcionario_base: {
          include: {
            execucao_funcionario: {
              // Ordena a lista pela propriedade "nome" da relação "formula"
              orderBy: { formula: { nome: 'asc' } },
              include: {
                formula: true,
                memoria_calculo: true,
              },
            },
          },
        },
      },
    });
    if (!execucao) throw new NotFoundException('Execucao not found');
    return execucao;
  }

  private async lockCreation(tx: Prisma.TransactionClient, filialId: number, periodoId: number) {
    const resource = `vale:execucao:${filialId}:${periodoId}`;
    const [lock] = await tx.$queryRaw<Array<{ result: number }>>`
      DECLARE @result int;
      EXEC @result = sp_getapplock @Resource = ${resource}, @LockMode = 'Exclusive',
        @LockOwner = 'Transaction', @LockTimeout = 5000;
      SELECT @result AS result;
    `;
    if (!lock || lock.result < 0) throw new Error('Outra criação está em andamento. Tente novamente.');
  }

  async createExecucao(
    filialId: number,
    execucao: Partial<execucao>,
    usuarioId: number,
    sessionId: string,
  ): Promise<{ status: boolean; message: string; data?: unknown }> {
    try {
      filialId = Number(filialId);
      const periodoId = Number(execucao.periodo_id);
      if (![filialId, periodoId].every((id) => Number.isSafeInteger(id) && id > 0)) {
        return { status: false, message: 'Filial ou competência inválida.' };
      }
      return await this.prisma.$transaction(async (tx) => {
        await this.lockCreation(tx, filialId, periodoId);
        const existing = await tx.execucao.findFirst({
          where: { filial_id: filialId, periodo_id: periodoId },
          orderBy: { execucao_id: 'desc' },
          select: { execucao_id: true },
        });
        if (existing) return {
          status: false,
          message: 'Esta filial já tem execução nesta competência. Use a execução existente.',
          data: { execucaoId: existing.execucao_id, alreadyExists: true },
        };
        if (!await this.formulaService.getActiveFormulaByFilialId(filialId)) {
          throw new NotFoundException('Formula not found');
        }
        const created = await tx.execucao.create({ data: {
          filial_id: filialId,
          periodo_id: periodoId,
          formula_id: null,
          status: 'AGUARDANDO',
          data_execucao: new Date(),
          usuario_execucao: usuarioId,
        } });
        const bases = await this.createExecucaoFuncionarioBase(created.execucao_id, sessionId, tx);
        if (!bases.status) throw new Error(bases.message);
        const results = await this.createExecucaoFuncionarios(created.execucao_id, tx);
        if (!results.status) throw new Error(results.message);
        return {
          status: true,
          message: 'Execucao criada com sucesso',
          data: { execucaoId: created.execucao_id },
        };
      }, { timeout: 120_000 });
    } catch (error) {
      if (error instanceof Error) {
        return {
          status: false,
          message: 'Erro ao criar execucao: ' + error.message,
        };
      }
      return {
        status: false,
        message: 'Erro ao criar execucao: ' + error,
      };
    }
  }

  async createExecucaoFuncionarioBase(
    execucaoId: number,
    sessionId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ status: boolean; message: string; data?: unknown }> {
    try {
      const execucao = await this.getExecucaoById(execucaoId, db);
      const codSentenca = execucao.filial.sql_codigo_rm; //SQL codigo RM da filial que traz os funcionarios
      if (!codSentenca) throw new NotFoundException('SQL codigo RM not found');

      //realiza a consulta SQL para trazer os funcionarios da filial
      const resultado = await this.rmService.realizaConsultaSql(
        codSentenca,
        {
          CODCOLIGADA: execucao.filial.codcoligada,
          CODFILIAL: execucao.filial.codfilial,
        },
        sessionId,
      );
      if (!resultado.status)
        return {
          status: false,
          message: resultado.message,
          data: resultado.data,
        };

      const funcionarios = Array.isArray(resultado.data)
        ? (resultado.data as unknown[])
        : [];
      if (funcionarios.length === 0) {
        this.logger.error(
          `Nenhum funcionário retornado pelo SQL RM para esta filial (execucao_funcionario_base vazio) - filial_id: ${execucao.filial.filial_id}`,
        );
        return {
          status: false,
          message:
            'Nenhum funcionário retornado pelo SQL RM para esta filial (execucao_funcionario_base vazio)',
          data: resultado.data,
        };
      }
      //agora insere todos os funcionarios da consulta SQL na tabela execucao_funcionario_base
      //vamos inserir usando o createMany, mas antes vamos prepara o array de funcionarios
      type RmFuncionario = {
        NOME: string;
        CHAPA: string;
        CARGO: string;
        DATAADMISSAO: Date;
        CODCOLIGADA: number;
        CODFILIAL: number;
        KM: number | null;
      };
      const newFuncBaseData: Prisma.execucao_funcionario_baseCreateManyInput[] =
        [];
      for (const funcionario of resultado.data as RmFuncionario[]) {
        newFuncBaseData.push({
          execucao_id: execucaoId,
          funcionario_id_rm: funcionario.CHAPA,
          nome_funcionario: funcionario.NOME,
          cargo: funcionario.CARGO,
          data_admissao: funcionario.DATAADMISSAO,
          codcoligada: funcionario.CODCOLIGADA,
          codfilial: funcionario.CODFILIAL,
          km: funcionario.KM,
        });
      }

      const createdFuncBase =
        await db.execucao_funcionario_base.createMany({
          data: newFuncBaseData,
        });
      if (!createdFuncBase || Number(createdFuncBase.count ?? 0) === 0) {
        return {
          status: false,
          message: 'Erro ao criar execucao funcionario base',
          data: newFuncBaseData,
        };
      }

      // Garante que todos os funcionários base comecem em PREVIA (mesmo que o default do banco mude futuramente)
      await db.execucao_funcionario_base.updateMany({
        where: { execucao_id: execucaoId },
        data: { status: ExecucaoService.STATUS_FUNC_BASE.PREVIA },
      });

      return {
        status: true,
        message: 'Execucao funcionario base criada com sucesso',
        data: resultado.data,
      };
    } catch (error) {
      console.error(error);
      return {
        status: false,
        message: 'Erro ao criar execucao funcionario base',
        data: error,
      };
    }
  }

  async createExecucaoFuncionarios(
    execucaoId: number,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<{ status: boolean; message: string; data?: unknown }> {
    try {
      const execucao = await this.getExecucaoById(execucaoId, db);
      if (!execucao) throw new NotFoundException('Execucao not found');
      if (
        !execucao.execucao_funcionario_base ||
        execucao.execucao_funcionario_base.length === 0
      )
        return {
          status: false,
          message:
            'Execucao funcionário base not found (nenhum funcionário encontrado para esta execução)',
        };

      const formulasAtivas = this.getFormulasAtivasDaExecucao(execucao);

      const newFuncExecData: Prisma.execucao_funcionarioCreateManyInput[] = [];
      for (const funcionarioBase of execucao.execucao_funcionario_base) {
        for (const formula of formulasAtivas) {
          newFuncExecData.push({
            execucao_id: execucaoId,
            funcionario_id_rm: funcionarioBase.funcionario_id_rm,
            formula_id: formula.formula_id,
            valor_calculado: null,
            valor_final: null,
            status: 'PREVIA',
            ajuste_manual: false,
            execucao_funcionario_base_id:
              funcionarioBase.execucao_funcionario_base_id,
          });
        }
      }
      const createdFuncExec = await db.execucao_funcionario.createMany(
        {
          data: newFuncExecData,
        },
      );
      if (!createdFuncExec) {
        return {
          status: false,
          message: 'Erro ao criar execucao funcionarios',
        };
      }
    } catch (error) {
      console.error(error);
      return {
        status: false,
        message: 'Erro ao criar execucao funcionarios',
        data: error,
      };
    }
    return {
      status: true,
      message: 'Execucao funcionarios criados com sucesso',
    };
  }

  async processarTodos(
    execucaoId: number,
    reprocessar: boolean = false,
  ): Promise<{ status: boolean; message: string }> {
    const execucao = await this.getExecucaoById(execucaoId);

    if (!execucao) throw new NotFoundException('Execucao not found');
    if (
      !execucao.execucao_funcionario_base ||
      execucao.execucao_funcionario_base.length === 0
    )
      throw new NotFoundException('Execucao funcionário base not found');

    const formulasAtivas = this.getFormulasAtivasDaExecucao(execucao);
    const variaveisFixas = this.getVariaveisFixas(execucao);
    const memoriaScopeByExecFuncId =
      await this.loadMemoriaScopeByExecucaoId(execucaoId);

    const basesComErro: number[] = [];
    const basesParcial: number[] = [];
    const basesOk: number[] = [];

    for (const funcionarioBase of execucao.execucao_funcionario_base) {
      let teveErro = false;
      let teveProcessado = false;

      // Regra: aqui NÃO consultamos RM. Se o funcionário ainda não teve variáveis processadas,
      // evitamos calcular resultados (para não “inventar” valores).
      // if (
      //   funcionarioBase.status !==
      //     ExecucaoService.STATUS_FUNC_BASE.VARIAVEIS_PROCESSADAS &&
      //   !reprocessar
      // ) {
      //   basesParcial.push(funcionarioBase.execucao_funcionario_base_id);
      //   continue;
      // }

      for (const formula of formulasAtivas) {
        try {
          const execFunc = await this.ensureResultadoPorFormula({
            execucaoId,
            execucaoFuncionarioBaseId:
              funcionarioBase.execucao_funcionario_base_id,
            funcionarioIdRm: funcionarioBase.funcionario_id_rm,
            formulaId: formula.formula_id,
          });

          if (!reprocessar && execFunc.status === 'PROCESSADO') {
            teveProcessado = true;
            continue;
          }

          const codigosNecessarios = this.extractCodesFromExpressao(
            formula.expressao,
          );
          const scope = await this.buildUserScopeBase({
            execucao,
            funcionarioBase,
            variaveisFixas,
            execucaoFuncionarioId: execFunc.execucao_funcionario_id,
            memoriaScopeByExecFuncId,
            codigosNecessarios,
          });

          // Se não tiver memória pra esse resultado/fórmula, é porque `processarVariaveis` não rodou (ou falhou).
          if (
            codigosNecessarios.size > 0 &&
            memoriaScopeByExecFuncId.get(execFunc.execucao_funcionario_id) ===
              undefined
          ) {
            teveErro = true;
            await this.prisma.execucao_funcionario.update({
              where: {
                execucao_funcionario_id: execFunc.execucao_funcionario_id,
              },
              data: { status: 'ERRO' },
            });
            await this.prisma.log_execucao.create({
              data: {
                execucao_id: execucaoId,
                nivel: 'ERROR',
                mensagem: `Sem memoria_calculo para fórmula ${formula.formula_id} do funcionário ${funcionarioBase.funcionario_id_rm}. Rode 'processarVariaveis' antes de 'processarTodos'.`,
              },
            });
            await this.appendExecucaoQueueLastError({
              execucaoId,
              execucaoFuncionarioBaseId:
                funcionarioBase.execucao_funcionario_base_id,
              tipo: 'VALORES',
              line: formatQueueErrorLine({
                code: 'ERRO_VALORES',
                message:
                  'Sem memória de cálculo para a fórmula; processe variáveis antes de calcular valores',
                context: {
                  funcionario: funcionarioBase.funcionario_id_rm,
                  formulaId: formula.formula_id,
                },
              }),
            });
            continue;
          }

          const resultado = this.calculatorService.calcularFormula(
            formula.expressao,
            scope,
          );

          if (!resultado.status) {
            await this.prisma.execucao_funcionario.update({
              where: {
                execucao_funcionario_id: execFunc.execucao_funcionario_id,
              },
              data: { status: 'ERRO' },
            });
            teveErro = true;
            await this.prisma.log_execucao.create({
              data: {
                execucao_id: execucaoId,
                nivel: 'ERROR',
                mensagem: `Erro ao calcular fórmula ${formula.formula_id} para funcionário ${funcionarioBase.funcionario_id_rm}: ${resultado.message}`,
              },
            });
            await this.appendExecucaoQueueLastError({
              execucaoId,
              execucaoFuncionarioBaseId:
                funcionarioBase.execucao_funcionario_base_id,
              tipo: 'VALORES',
              line: formatQueueErrorLine({
                code: 'ERRO_VALORES',
                message: `Erro ao calcular fórmula: ${resultado.message}`,
                context: {
                  funcionario: funcionarioBase.funcionario_id_rm,
                  formulaId: formula.formula_id,
                },
              }),
            });
            continue;
          }

          await this.operacao.saveCalculation(execFunc.execucao_funcionario_id, resultado.resultado!, formula);
          teveProcessado = true;
        } catch (error) {
          console.error(error);
          teveErro = true;
          await this.prisma.log_execucao.create({
            data: {
              execucao_id: execucaoId,
              nivel: 'ERROR',
              mensagem: `Erro inesperado ao processar funcionário ${funcionarioBase.funcionario_id_rm}: ${error instanceof Error ? error.message : String(error)}`,
            },
          });
          await this.appendExecucaoQueueLastError({
            execucaoId,
            execucaoFuncionarioBaseId:
              funcionarioBase.execucao_funcionario_base_id,
            tipo: 'VALORES',
            line: formatQueueErrorLine({
              code: 'ERRO_DESCONHECIDO',
              message:
                error instanceof Error
                  ? error.message
                  : String(error ?? 'Erro inesperado'),
              context: {
                funcionario: funcionarioBase.funcionario_id_rm,
                etapa: 'processarTodos',
              },
            }),
          });
          continue;
        }
      }

      // Atualiza status do funcionário base (linha do frontend)
      // Regras:
      // - se teveErro => ERRO_RESULTADOS
      // - se não teveErro e teveProcessado => RESULTADOS_PROCESSADOS
      // - se não teveErro e não processou nada (situação rara) => mantém PREVIA
      if (teveErro) {
        basesComErro.push(funcionarioBase.execucao_funcionario_base_id);
      } else if (teveProcessado) {
        basesOk.push(funcionarioBase.execucao_funcionario_base_id);
      } else {
        basesParcial.push(funcionarioBase.execucao_funcionario_base_id);
      }
    }

    if (basesComErro.length > 0) {
      await this.prisma.execucao_funcionario_base.updateMany({
        where: { execucao_funcionario_base_id: { in: basesComErro } },
        data: { status: ExecucaoService.STATUS_FUNC_BASE.ERRO_RESULTADOS },
      });
    }
    if (basesOk.length > 0) {
      await this.prisma.execucao_funcionario_base.updateMany({
        where: { execucao_funcionario_base_id: { in: basesOk } },
        data: {
          status: ExecucaoService.STATUS_FUNC_BASE.RESULTADOS_PROCESSADOS,
        },
      });
    }
    if (basesParcial.length > 0) {
      await this.prisma.execucao_funcionario_base.updateMany({
        where: { execucao_funcionario_base_id: { in: basesParcial } },
        data: { status: ExecucaoService.STATUS_FUNC_BASE.RESULTADOS_PARCIAL },
      });
    }

    return { status: true, message: 'Execucao processada com sucesso' };
  }

  async processarValoresBatch(
    execucaoId: number,
    rows: execucao_funcionario_base[],
  ): Promise<{ status: boolean; message: string; falhasFormulaIds?: number[] }> {
    try {
      this.logger.log(
        `Processando valores batch para execução ${execucaoId} com ${rows.length} funcionários`,
      );
      const execucao = await this.getExecucaoById(execucaoId);
      if (!execucao) throw new NotFoundException('Execucao not found');
      if (
        !execucao.execucao_funcionario_base ||
        execucao.execucao_funcionario_base.length === 0
      )
        throw new NotFoundException('Execucao sem funcionarios');

      if (!rows || rows.length === 0) {
        return { status: false, message: 'Nenhum funcionário selecionado' };
      }

      const selectedBaseIds = new Set(
        rows.map((r) => r.execucao_funcionario_base_id).filter(Boolean),
      );
      const basesSelecionadas = execucao.execucao_funcionario_base.filter((b) =>
        selectedBaseIds.has(b.execucao_funcionario_base_id),
      );
      if (basesSelecionadas.length === 0) {
        return {
          status: false,
          message: 'Nenhum funcionário selecionado pertence a esta execução',
        };
      }

      const formulasAtivas = this.getFormulasAtivasDaExecucao(execucao);
      const variaveisFixas = this.getVariaveisFixas(execucao);

      // Carrega a memória somente para os exec_funcs impactados (para não depender do include do getExecucaoById)
      const execFuncIds = (
        await this.prisma.execucao_funcionario.findMany({
          where: {
            execucao_id: execucaoId,
            execucao_funcionario_base_id: {
              in: basesSelecionadas.map((b) => b.execucao_funcionario_base_id),
            },
            formula_id: { in: formulasAtivas.map((f) => f.formula_id) },
          },
          select: { execucao_funcionario_id: true },
        })
      ).map((r) => r.execucao_funcionario_id);

      const memoriaRows = await this.prisma.memoria_calculo.findMany({
        where: {
          execucao_funcionario_id: { in: execFuncIds },
        },
        select: {
          execucao_funcionario_id: true,
          variavel_codigo: true,
          valor: true,
        },
      });

      const memoriaScopeByExecFuncId = new Map<
        number,
        Record<string, number>
      >();
      for (const row of memoriaRows) {
        const scope =
          memoriaScopeByExecFuncId.get(row.execucao_funcionario_id) ?? {};
        scope[row.variavel_codigo] = Number(row.valor);
        memoriaScopeByExecFuncId.set(row.execucao_funcionario_id, scope);
      }

      const falhasFormulaIds = new Set<number>();
      const basesComErro: number[] = [];
      const basesOk: number[] = [];

      for (const funcionarioBase of basesSelecionadas) {
        this.logger.log(
          `Processando funcionário ${funcionarioBase.funcionario_id_rm} para execução ${execucaoId}`,
        );
        let teveErro = false;
        let teveProcessado = false;

        for (const formula of formulasAtivas) {
          this.logger.log(
            `Processando fórmula ${formula.formula_id} para funcionário ${funcionarioBase.funcionario_id_rm}`,
          );
          try {
            // Reprocesso forçado: sempre recalcular (mas respeitando ajuste_manual p/ valor_final)
            const execFunc = await this.ensureResultadoPorFormula({
              execucaoId,
              execucaoFuncionarioBaseId:
                funcionarioBase.execucao_funcionario_base_id,
              funcionarioIdRm: funcionarioBase.funcionario_id_rm,
              formulaId: formula.formula_id,
            });

            const codigosNecessarios = this.extractCodesFromExpressao(
              formula.expressao,
            );
            this.logger.log(
              `Codigos necessários para fórmula ${formula.formula_id}: ${Array.from(codigosNecessarios).join(', ')}`,
            );
            const scope = await this.buildUserScopeBase({
              execucao,
              funcionarioBase,
              variaveisFixas,
              execucaoFuncionarioId: execFunc.execucao_funcionario_id,
              memoriaScopeByExecFuncId,
              codigosNecessarios,
            });

            // Se não tiver memória para esta fórmula/funcionário, marcamos erro
            if (
              codigosNecessarios.size > 0 &&
              memoriaScopeByExecFuncId.get(execFunc.execucao_funcionario_id) ===
                undefined
            ) {
              teveErro = true;
              this.logger.error(
                `Sem memoria_calculo para fórmula ${formula.formula_id} do funcionário ${funcionarioBase.funcionario_id_rm}. Rode 'processarVariaveisBatch' antes de 'processarValoresBatch'.`,
              );
              await this.prisma.execucao_funcionario.update({
                where: {
                  execucao_funcionario_id: execFunc.execucao_funcionario_id,
                },
                data: { status: 'ERRO' },
              });
              await this.prisma.log_execucao.create({
                data: {
                  execucao_id: execucaoId,
                  nivel: 'ERROR',
                  mensagem: `Sem memoria_calculo para fórmula ${formula.formula_id} do funcionário ${funcionarioBase.funcionario_id_rm}. Rode 'processarVariaveisBatch' antes de 'processarValoresBatch'.`,
                },
              });
              continue;
            }

            this.logger.log(
              `Calculando fórmula ${formula.formula_id} para funcionário ${funcionarioBase.funcionario_id_rm}`,
            );
            const resultado = this.calculatorService.calcularFormula(
              formula.expressao,
              scope,
            );
            this.logger.log(
              `Resultado calculado para fórmula ${formula.formula_id} para funcionário ${funcionarioBase.funcionario_id_rm}: ${JSON.stringify(resultado)}`,
            );

            if (!resultado.status) {
              falhasFormulaIds.add(funcionarioBase.execucao_funcionario_base_id);
              teveErro = true;
              this.logger.error(
                `Erro ao calcular fórmula ${formula.formula_id} para funcionário ${funcionarioBase.funcionario_id_rm}: ${resultado.message}`,
              );
              await this.prisma.execucao_funcionario.update({
                where: {
                  execucao_funcionario_id: execFunc.execucao_funcionario_id,
                },
                data: { status: 'ERRO' },
              });
              await this.prisma.log_execucao.create({
                data: {
                  execucao_id: execucaoId,
                  nivel: 'ERROR',
                  mensagem: `Erro ao calcular fórmula ${formula.formula_id} para funcionário ${funcionarioBase.funcionario_id_rm}: ${resultado.message}`,
                },
              });
              continue;
            }

            await this.operacao.saveCalculation(execFunc.execucao_funcionario_id, resultado.resultado!, formula);
          teveProcessado = true;
          } catch (error) {
            this.logger.error(
              `Erro inesperado ao processar valores do funcionário ${funcionarioBase.funcionario_id_rm}: ${error instanceof Error ? error.message : String(error)}`,
            );
            console.error(error);
            teveErro = true;
            await this.prisma.log_execucao.create({
              data: {
                execucao_id: execucaoId,
                nivel: 'ERROR',
                mensagem: `Erro inesperado ao processar valores do funcionário ${funcionarioBase.funcionario_id_rm}: ${error instanceof Error ? error.message : String(error)}`,
              },
            });
            continue;
          }
        }

        if (teveErro) {
          basesComErro.push(funcionarioBase.execucao_funcionario_base_id);
        } else if (teveProcessado) {
          basesOk.push(funcionarioBase.execucao_funcionario_base_id);
        }
      }

      if (basesComErro.length > 0) {
        await this.prisma.execucao_funcionario_base.updateMany({
          where: { execucao_funcionario_base_id: { in: basesComErro } },
          data: { status: ExecucaoService.STATUS_FUNC_BASE.ERRO_RESULTADOS },
        });
      }
      if (basesOk.length > 0) {
        await this.prisma.execucao_funcionario_base.updateMany({
          where: { execucao_funcionario_base_id: { in: basesOk } },
          data: {
            status: ExecucaoService.STATUS_FUNC_BASE.RESULTADOS_PROCESSADOS,
          },
        });
      }

      return {
        status: true,
        message: 'Processamento de valores (batch) concluído com sucesso',
        falhasFormulaIds: [...falhasFormulaIds],
      };
    } catch (error) {
      console.error(error);
      return { status: false, message: 'Erro ao processar valores (batch)' };
    }
  }

  async processarVariaveis(
    execucaoId: number,
    sessionId: string,
  ): Promise<{ status: boolean; message: string }> {
    try {
      const execucao = await this.getContextoVariaveis(execucaoId);
      if (!execucao) throw new NotFoundException('Execucao not found');
      if (
        !execucao.execucao_funcionario_base ||
        execucao.execucao_funcionario_base.length === 0
      )
        throw new NotFoundException('Execucao sem funcionarios');

      const formulasAtivas = this.getFormulasAtivasDaExecucao(execucao);
      const codigosPorFormula = new Map(
        formulasAtivas.map((formula) => [
          formula.formula_id, this.extractCodesFromExpressao(formula.expressao),
        ]),
      );
      const variaveisFixas = this.getVariaveisFixas(execucao);

      const variaveisAtivas = execucao.filial.variavel.filter((v) => v.ativa);
      const variavelByCodigo = new Map(
        variaveisAtivas.map((v) => [v.codigo, v]),
      );

      // Importante: evita duplicar se o usuário clicar em "Processar Variaveis" mais de uma vez.
      await this.prisma.memoria_calculo.deleteMany({
        where: {
          execucao_funcionario: {
            execucao_id: execucaoId,
          },
        },
      });
      //Além disso, temos que alterar o status dos funcionarios para PREVIA
      await this.prisma.execucao_funcionario_base.updateMany({
        where: { execucao_id: execucaoId },
        data: { status: ExecucaoService.STATUS_FUNC_BASE.PREVIA },
      });

      const memoriaRows: Prisma.memoria_calculoCreateManyInput[] = [];

      const chunk = <T>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) {
          out.push(arr.slice(i, i + size));
        }
        return out;
      };

      const basesOk: number[] = [];
      const basesComErro: number[] = [];

      await this.variableWorkers.forEach(execucao.execucao_funcionario_base, async (funcionarioBase) => {
        try {
          const scopeBase = await this.buildUserScopeBase({
            execucao,
            funcionarioBase,
            variaveisFixas,
          });

          for (const formula of formulasAtivas) {
            const execFunc = await this.ensureResultadoPorFormula({
              execucaoId,
              execucaoFuncionarioBaseId:
                funcionarioBase.execucao_funcionario_base_id,
              funcionarioIdRm: funcionarioBase.funcionario_id_rm,
              formulaId: formula.formula_id,
            });

            const codigos = codigosPorFormula.get(formula.formula_id)!;
            if (codigos.size === 0) continue;

            for (const codigo of codigos) {
              const variavel = variavelByCodigo.get(codigo);
              if (!variavel) continue;

              // Variável fixa (já deve estar no scopeBase)
              if (
                variavel.valor_fixo !== null &&
                variavel.valor_fixo !== undefined &&
                String(variavel.valor_fixo).trim() !== ''
              ) {
                const valor = Number(variavel.valor_fixo);
                scopeBase[codigo] = valor;
                memoriaRows.push({
                  execucao_funcionario_id: execFunc.execucao_funcionario_id,
                  variavel_id: variavel.variavel_id,
                  variavel_codigo: codigo,
                  variavel_nome: variavel.nome,
                  valor,
                  origem: 'FIXA',
                  detalhe: 'valor_fixo da filial',
                });
                continue;
              }

              // Variável SQL (por usuário) - TODO: encaixar consulta no RM
              if (variavel.sql_codigo_rm) {
                // Cache "do bem": se já calculamos essa variável para este funcionário, não chama RM de novo.
                // Ainda assim, registramos na memória (por fórmula) usando o mesmo valor.
                const cached = scopeBase[codigo];
                if (cached !== undefined) {
                  memoriaRows.push({
                    execucao_funcionario_id: execFunc.execucao_funcionario_id,
                    variavel_id: variavel.variavel_id,
                    variavel_codigo: codigo,
                    variavel_nome: variavel.nome,
                    valor: cached,
                    origem: 'SQL',
                    detalhe: `cache_sql da filial: ${variavel.sql_codigo_rm}`,
                  });
                  continue;
                }

                const resultadoConsulta =
                  (await this.rmService.realizaConsultaSql(
                    variavel.sql_codigo_rm,
                    {
                      //Tomando cuidado com as datas para o formato do RM(YYYY-MM-DD) sem horas
                      DTINICIO: execucao.periodo.data_inicio
                        .toISOString()
                        .split('T')[0],
                      DTFINAL: execucao.periodo.data_fim
                        .toISOString()
                        .split('T')[0],
                      CODCOLIGADA: funcionarioBase.codcoligada,
                      CODFILIAL: funcionarioBase.codfilial,
                      CHAPA: funcionarioBase.funcionario_id_rm,
                    },
                    sessionId,
                  )) as {
                    status: boolean;
                    message: string;
                    data: [{ RESULTADO?: number }];
                  };
                if (!resultadoConsulta.status) {
                  basesComErro.push(
                    funcionarioBase.execucao_funcionario_base_id,
                  );
                  await this.prisma.log_execucao.create({
                    data: {
                      execucao_id: execucaoId,
                      nivel: 'ERROR',
                      mensagem: `Erro ao consultar variável ${codigo} (SQL ${variavel.sql_codigo_rm}) do funcionário ${funcionarioBase.funcionario_id_rm}: ${resultadoConsulta.message}`,
                    },
                  });
                  await this.appendExecucaoQueueLastError({
                    execucaoId,
                    execucaoFuncionarioBaseId:
                      funcionarioBase.execucao_funcionario_base_id,
                    tipo: 'VARIAVEIS',
                    line: formatQueueErrorLine({
                      code: 'ERRO_VARIAVEIS',
                      message: `Falha ao consultar variável no RM: ${resultadoConsulta.message}`,
                      context: {
                        funcionario: funcionarioBase.funcionario_id_rm,
                        variavel: codigo,
                        sql: variavel.sql_codigo_rm,
                      },
                    }),
                  });
                  continue;
                }
                const valorFinal = readRmVariable(variavel.sql_codigo_rm, resultadoConsulta.data);
                if (!Number.isFinite(valorFinal)) {
                  throw new Error(`Dado ausente ou inválido no RM: ${variavel.codigo} (${variavel.sql_codigo_rm}).`);
                }

                scopeBase[codigo] = valorFinal;
                memoriaRows.push({
                  execucao_funcionario_id: execFunc.execucao_funcionario_id,
                  variavel_id: variavel.variavel_id,
                  variavel_codigo: codigo,
                  variavel_nome: variavel.nome,
                  valor: valorFinal,
                  origem: 'SQL',
                  detalhe: `valor_sql da filial: ${variavel.sql_codigo_rm} - ${resultadoConsulta.message}`,
                });
                continue;
              }
              // Variável calculada/local (ex.: distância, tempo de casa, etc.) - TODO
              continue;
            }
          }

          basesOk.push(funcionarioBase.execucao_funcionario_base_id);
        } catch (error) {
          console.error(error);
          basesComErro.push(funcionarioBase.execucao_funcionario_base_id);
          await this.prisma.log_execucao.create({
            data: {
              execucao_id: execucaoId,
              nivel: 'ERROR',
              mensagem: `Erro ao processar variáveis do funcionário ${funcionarioBase.funcionario_id_rm}: ${error instanceof Error ? error.message : String(error)}`,
            },
          });
          await this.appendExecucaoQueueLastError({
            execucaoId,
            execucaoFuncionarioBaseId:
              funcionarioBase.execucao_funcionario_base_id,
            tipo: 'VARIAVEIS',
            line: formatQueueErrorLine({
              code: 'ERRO_DESCONHECIDO',
              message:
                error instanceof Error
                  ? error.message
                  : String(error ?? 'Erro inesperado'),
              context: {
                funcionario: funcionarioBase.funcionario_id_rm,
                etapa: 'processarVariaveis',
              },
            }),
          });
          return;
        }
      });

      // Persistência em lote (createMany) em chunks para não estourar payload/timeout
      const CHUNK_SIZE = 1000;
      for (const batch of chunk(memoriaRows, CHUNK_SIZE)) {
        if (batch.length === 0) continue;
        await this.prisma.memoria_calculo.createMany({
          data: batch,
        });
      }

      if (basesOk.length > 0) {
        await this.prisma.execucao_funcionario_base.updateMany({
          where: { execucao_funcionario_base_id: { in: basesOk } },
          data: {
            status: ExecucaoService.STATUS_FUNC_BASE.VARIAVEIS_PROCESSADAS,
          },
        });
      }
      if (basesComErro.length > 0) {
        await this.prisma.execucao_funcionario_base.updateMany({
          where: { execucao_funcionario_base_id: { in: basesComErro } },
          data: { status: ExecucaoService.STATUS_FUNC_BASE.ERRO_VARIAVEIS },
        });
      }

      return {
        status: true,
        message: 'Processamento de variáveis concluído com sucesso',
      };
    } catch (error) {
      console.error(error);
      return {
        status: false,
        message: 'Erro ao processar variáveis',
      };
    }
  }

  async processarVariaveisBatch(
    execucaoId: number,
    rows: execucao_funcionario_base[],
    sessionId: string,
  ): Promise<{ status: boolean; message: string; falhasSemRetryIds?: number[] }> {
    const startedAt = process.hrtime.bigint();
    let cacheHits = 0;
    const timings = new Map<string, { chamadas: number; totalMs: number; maxMs: number }>();
    try {
      this.logger.log(
        `Processando variáveis batch para execução ${execucaoId} com ${rows.length} funcionários`,
      );
      const execucao = await this.getContextoVariaveis(
        execucaoId,
        (rows ?? []).map((r) => r.execucao_funcionario_base_id).filter(Boolean),
      );
      if (!execucao) throw new NotFoundException('Execucao not found');
      if (
        !execucao.execucao_funcionario_base ||
        execucao.execucao_funcionario_base.length === 0
      )
        throw new NotFoundException('Execucao sem funcionarios');

      if (!rows || rows.length === 0) {
        return { status: false, message: 'Nenhum funcionário selecionado' };
      }

      const selectedBaseIds = new Set(
        rows.map((r) => r.execucao_funcionario_base_id).filter(Boolean),
      );
      const basesSelecionadas = execucao.execucao_funcionario_base.filter((b) =>
        selectedBaseIds.has(b.execucao_funcionario_base_id),
      );
      if (basesSelecionadas.length === 0) {
        return {
          status: false,
          message: 'Nenhum funcionário selecionado pertence a esta execução',
        };
      }

      const formulasAtivas = this.getFormulasAtivasDaExecucao(execucao);
      const codigosPorFormula = new Map(
        formulasAtivas.map((formula) => [
          formula.formula_id, this.extractCodesFromExpressao(formula.expressao),
        ]),
      );
      const variaveisFixas = this.getVariaveisFixas(execucao);

      const variaveisAtivas = execucao.filial.variavel.filter((v) => v.ativa);
      const variavelByCodigo = new Map(
        variaveisAtivas.map((v) => [v.codigo, v]),
      );

      // Limpa a memória APENAS dos funcionários selecionados (e fórmulas ativas)
      const execFuncsParaLimpar =
        await this.prisma.execucao_funcionario.findMany({
          where: {
            execucao_id: execucaoId,
            execucao_funcionario_base_id: {
              in: basesSelecionadas.map((b) => b.execucao_funcionario_base_id),
            },
            formula_id: { in: formulasAtivas.map((f) => f.formula_id) },
          },
          select: { execucao_funcionario_id: true },
        });
      const execFuncIdsParaLimpar = execFuncsParaLimpar.map(
        (r) => r.execucao_funcionario_id,
      );
      if (execFuncIdsParaLimpar.length > 0) {
        await this.prisma.memoria_calculo.deleteMany({
          where: { execucao_funcionario_id: { in: execFuncIdsParaLimpar } },
        });
      }

      // Reprocesso forçado (batch): volta status para PREVIA apenas dos selecionados
      await this.prisma.execucao_funcionario_base.updateMany({
        where: { execucao_funcionario_base_id: { in: [...selectedBaseIds] } },
        data: { status: ExecucaoService.STATUS_FUNC_BASE.PREVIA },
      });

      const memoriaRows: Prisma.memoria_calculoCreateManyInput[] = [];

      const chunk = <T>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) {
          out.push(arr.slice(i, i + size));
        }
        return out;
      };

      const basesOk: number[] = [];
      const basesComErro: number[] = [];

      const falhasSemRetryIds: number[] = [];
      await this.variableWorkers.forEach(basesSelecionadas, async (funcionarioBase) => {
        let funcionarioOk = true;

        const scopeBase = await this.buildUserScopeBase({
          execucao,
          funcionarioBase,
          variaveisFixas,
        });

        for (const formula of formulasAtivas) {
          const execFunc = await this.ensureResultadoPorFormula({
            execucaoId,
            execucaoFuncionarioBaseId:
              funcionarioBase.execucao_funcionario_base_id,
            funcionarioIdRm: funcionarioBase.funcionario_id_rm,
            formulaId: formula.formula_id,
          });

          const codigos = codigosPorFormula.get(formula.formula_id)!;
          if (codigos.size === 0) continue;

          for (const codigo of codigos) {
            const variavel = variavelByCodigo.get(codigo);
            if (!variavel) continue;

            // FIXA
            if (
              variavel.valor_fixo !== null &&
              variavel.valor_fixo !== undefined &&
              String(variavel.valor_fixo).trim() !== ''
            ) {
              const valor = Number(variavel.valor_fixo);
              scopeBase[codigo] = valor;
              memoriaRows.push({
                execucao_funcionario_id: execFunc.execucao_funcionario_id,
                variavel_id: variavel.variavel_id,
                variavel_codigo: codigo,
                variavel_nome: variavel.nome,
                valor,
                origem: 'FIXA',
                detalhe: 'valor_fixo da filial',
              });
              continue;
            }

            // SQL (RM)
            if (variavel.sql_codigo_rm) {
              // Cache "do bem": se já calculamos essa variável para este funcionário, não chama RM de novo.
              // Ainda assim, registramos na memória (por fórmula) usando o mesmo valor.
              const cached = scopeBase[codigo];
              if (cached !== undefined) {
                cacheHits++;
                memoriaRows.push({
                  execucao_funcionario_id: execFunc.execucao_funcionario_id,
                  variavel_id: variavel.variavel_id,
                  variavel_codigo: codigo,
                  variavel_nome: variavel.nome,
                  valor: cached,
                  origem: 'SQL',
                  detalhe: `cache_sql da filial: ${variavel.sql_codigo_rm}`,
                });
                continue;
              }

              const dataToConsulta = {
                DTINICIO: execucao.periodo.data_inicio
                  .toISOString()
                  .split('T')[0],
                DTFINAL: execucao.periodo.data_fim.toISOString().split('T')[0],
                CODCOLIGADA: funcionarioBase.codcoligada,
                CODFILIAL: funcionarioBase.codfilial,
                CHAPA: funcionarioBase.funcionario_id_rm,
                KM_MAX: execucao.filial.km_max.toNumber(),
              };
              const queryStartedAt = process.hrtime.bigint();
              const resultadoConsulta =
                (await this.rmService.realizaConsultaSql(
                  variavel.sql_codigo_rm,
                  dataToConsulta,
                  sessionId,
                )) as {
                  status: boolean;
                  message: string;
                  data: [{ RESULTADO?: number }];
                  http?: {
                    status?: number;
                    statusText?: string;
                    url?: string;
                    method?: string;
                    axiosCode?: string;
                  };
                };
              const elapsedMs = Number(process.hrtime.bigint() - queryStartedAt) / 1e6;
              const timing = timings.get(variavel.sql_codigo_rm) ?? { chamadas: 0, totalMs: 0, maxMs: 0 };
              timing.chamadas++;
              timing.totalMs += elapsedMs;
              timing.maxMs = Math.max(timing.maxMs, elapsedMs);
              timings.set(variavel.sql_codigo_rm, timing);
              const valorFinal = resultadoConsulta.status
                ? readRmVariable(variavel.sql_codigo_rm, resultadoConsulta.data)
                : NaN;
              if (!Number.isFinite(valorFinal)) {
                funcionarioOk = false;
                if (isRmVariableFailureFinal(resultadoConsulta))
                  falhasSemRetryIds.push(funcionarioBase.execucao_funcionario_base_id);
                const reason = resultadoConsulta.status
                  ? 'Dado ausente ou inválido no RM.'
                  : resultadoConsulta.message;
                const message = `${variavel.codigo} (${variavel.sql_codigo_rm}): ${reason}`;
                this.logger.error(message);
                await this.appendExecucaoQueueLastError({
                  execucaoId,
                  execucaoFuncionarioBaseId: funcionarioBase.execucao_funcionario_base_id,
                  tipo: 'VARIAVEIS',
                  line: formatQueueErrorLine({ code: 'ERRO_VARIAVEIS', message }),
                  onlyProcessing: true,
                });
                await this.prisma.log_execucao.create({
                  data: {
                    execucao_id: execucaoId,
                    nivel: 'ERROR',
                    mensagem: `Erro RM variavel ${variavel.codigo} (${variavel.sql_codigo_rm}) para funcionário ${funcionarioBase.funcionario_id_rm}: ${reason}`,
                  },
                });
                break;
              }

              scopeBase[codigo] = valorFinal;
              memoriaRows.push({
                execucao_funcionario_id: execFunc.execucao_funcionario_id,
                variavel_id: variavel.variavel_id,
                variavel_codigo: codigo,
                variavel_nome: variavel.nome,
                valor: valorFinal,
                origem: 'SQL',
                detalhe: `valor_sql da filial: ${variavel.sql_codigo_rm} - ${resultadoConsulta.message}`,
              });
              continue;
            }

            // TODO: variáveis calculadas/local
          }

          if (!funcionarioOk) break;
        }

        if (funcionarioOk) {
          basesOk.push(funcionarioBase.execucao_funcionario_base_id);
        } else {
          basesComErro.push(funcionarioBase.execucao_funcionario_base_id);
        }
      });

      this.logger.log(
        `Inserção em lote de ${memoriaRows.length} memoria_calculo para execução ${execucaoId}`,
      );

      // Inserção em lote
      const CHUNK_SIZE = 1000;
      for (const batch of chunk(memoriaRows, CHUNK_SIZE)) {
        if (batch.length === 0) continue;
        const created = await this.prisma.memoria_calculo.createMany({
          data: batch,
        });
        this.logger.log(
          `Inserção em lote de ${created.count} memoria_calculo para execução ${execucaoId} com sucesso`,
        );
      }

      if (basesOk.length > 0) {
        await this.prisma.execucao_funcionario_base.updateMany({
          where: { execucao_funcionario_base_id: { in: basesOk } },
          data: {
            status: ExecucaoService.STATUS_FUNC_BASE.VARIAVEIS_PROCESSADAS,
          },
        });
      }
      if (basesComErro.length > 0) {
        this.logger.log(
          `Atualização de status para ERRO_VARIAVEIS para ${basesComErro.length} funcionários para execução ${execucaoId}`,
        );
        this.logger.error(`Bases com erro: ${basesComErro.join(', ')}`);
        await this.prisma.execucao_funcionario_base.updateMany({
          where: { execucao_funcionario_base_id: { in: basesComErro } },
          data: { status: ExecucaoService.STATUS_FUNC_BASE.ERRO_VARIAVEIS },
        });
      }

      this.logger.log('[variables.batch] ' + JSON.stringify({
        execucaoId, funcionarios: basesSelecionadas.length,
        concorrencia: this.variableConcurrencyLimit,
        duracaoMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        cacheHits, funcionariosOk: basesOk.length,
        funcionariosErro: basesComErro.length,
        falhasSemRetry: falhasSemRetryIds.length,
        consultas: [...timings].map(([sentenca, timing]) => ({ sentenca, ...timing })),
      }));
      return {
        status: true,
        message: 'Processamento de variáveis (batch) concluído com sucesso',
        falhasSemRetryIds,
      };
    } catch (error) {
      console.error(error);
      this.logger.error(
        `Erro ao processar variáveis (batch): ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: false, message: 'Erro ao processar variáveis (batch)' };
    }
  }

  async enqueueVariaveisBatch(execucaoId: number, ids: number[], sessionId: string): Promise<{status: boolean; message: string}> {
    return this.operacao.enqueueInitial(execucaoId, ids, 'VARIAVEIS', sessionId);
  }

  async enqueueValoresBatch(execucaoId: number, ids: number[], sessionId: string): Promise<{status: boolean; message: string}> {
    return this.operacao.enqueueInitial(execucaoId, ids, 'VALORES', sessionId);
  }

  async enqueueEnviarRmBatch(_execucaoId: number, _ids: number[], _sessionId: string): Promise<{status: boolean; message: string}> {
    throw new BadRequestException('Abra a conferência e revise o lote antes de enviar ao RM.');
  }

  async enqueueEnviarRmByExecucoes(_params: {execucaoIds: number[]; sessionId: string}): Promise<{status: boolean; message: string}> {
    throw new BadRequestException('Atualize a página e revise o lote antes de enviar ao RM.');
  }

  async processarEnviarRmBatch(
    execucaoId: number,
    rows: execucao_funcionario_base[],
    sessionId: string,
  ): Promise<{ status: boolean; message: string }> {
    try {
      this.logger.log(
        `processarEnviarRmBatch: execucaoId=${execucaoId} com ${rows.length} funcionários`,
      );
      const dataServer = process.env.RM_METADATA_DATASERVER;
      const tableName = process.env.RM_METADATA_TABLE ?? 'ZMDVALORES_VALE';
      if (!dataServer) {
        this.logger.error('RM_METADATA_DATASERVER não configurado');
        return {
          status: false,
          message: 'RM_METADATA_DATASERVER não configurado',
        };
      }

      const execucao = await this.getExecucaoById(execucaoId);
      if (!execucao) throw new NotFoundException('Execucao not found');
      if (!execucao.periodo) throw new NotFoundException('Periodo not found');
      if (!execucao.filial) throw new NotFoundException('Filial not found');

      if (!rows || rows.length === 0) {
        this.logger.error('Nenhum funcionário selecionado');
        return { status: false, message: 'Nenhum funcionário selecionado' };
      }

      const selectedBaseIds = new Set(
        rows.map((r) => r.execucao_funcionario_base_id).filter(Boolean),
      );
      const basesSelecionadas = execucao.execucao_funcionario_base.filter((b) =>
        selectedBaseIds.has(b.execucao_funcionario_base_id),
      );
      if (basesSelecionadas.length === 0) {
        this.logger.error(
          'Nenhum funcionário selecionado pertence a esta execução',
        );
        return {
          status: false,
          message: 'Nenhum funcionário selecionado pertence a esta execução',
        };
      }

      const basesOk: number[] = [];
      const basesComErro: number[] = [];

      for (const base of basesSelecionadas) {
        this.logger.log(
          `processarEnviarRmBatch: processando funcionário ${base.funcionario_id_rm}`,
        );
        if (
          //Se o status não for RESULTADOS_PROCESSADOS ou ERRO_RM, não processa o envio para o RM
          base.status !==
            ExecucaoService.STATUS_FUNC_BASE.RESULTADOS_PROCESSADOS &&
          base.status !== ExecucaoService.STATUS_FUNC_BASE.ENVIADO_RM &&
          base.status !== ExecucaoService.STATUS_FUNC_BASE.ERRO_RM
        ) {
          this.logger.error(
            `Funcionário ${base.funcionario_id_rm} não está apto para envio (status=${base.status}).`,
          );
          basesComErro.push(base.execucao_funcionario_base_id);
          await this.prisma.log_execucao.create({
            data: {
              execucao_id: execucaoId,
              nivel: 'ERROR',
              mensagem: `Funcionário ${base.funcionario_id_rm} não está apto para envio (status=${base.status}).`,
            },
          });
          await this.appendExecucaoQueueLastError({
            execucaoId,
            execucaoFuncionarioBaseId: base.execucao_funcionario_base_id,
            tipo: 'ENVIAR_RM',
            line: formatQueueErrorLine({
              code: 'ERRO_ENVIAR_RM',
              message: 'Funcionário não está apto para envio ao RM',
              context: {
                funcionario: base.funcionario_id_rm,
                status: base.status,
              },
            }),
          });
          continue;
        }

        const execFuncs = await this.prisma.execucao_funcionario.findMany({
          where: {
            execucao_id: execucaoId,
            execucao_funcionario_base_id: base.execucao_funcionario_base_id,
          },
          include: { formula: true },
        });
        if (!execFuncs || execFuncs.length === 0) {
          this.logger.error(
            `Sem execucao_funcionario para funcionário ${base.funcionario_id_rm}. Rode cálculo de valores antes do envio RM.`,
          );
          basesComErro.push(base.execucao_funcionario_base_id);
          await this.prisma.log_execucao.create({
            data: {
              execucao_id: execucaoId,
              nivel: 'ERROR',
              mensagem: `Sem execucao_funcionario para funcionário ${base.funcionario_id_rm}. Rode cálculo de valores antes do envio RM.`,
            },
          });
          await this.appendExecucaoQueueLastError({
            execucaoId,
            execucaoFuncionarioBaseId: base.execucao_funcionario_base_id,
            tipo: 'ENVIAR_RM',
            line: formatQueueErrorLine({
              code: 'ERRO_ENVIAR_RM',
              message:
                'Sem resultados por fórmula para envio; processe valores antes de enviar ao RM',
              context: { funcionario: base.funcionario_id_rm },
            }),
          });
          continue;
        }

        let teveErro = false;
        for (const execFunc of execFuncs) {
          try {
            if (execFunc.status === 'ENVIADO_RM' && execFunc.enviado_revisao === execFunc.revisao) continue;
            const approved = await this.operacao.approvedEvent(base.execucao_funcionario_base_id, execFunc.execucao_funcionario_id, execFunc.revisao);
            const codevento = approved.record.CODEVENTO;
            const tipo = approved.record.TIPO;
            const valor = execFunc.valor_final;

            if (!codevento || !tipo) {
              this.logger.error(
                `Fórmula ${execFunc.formula_id} sem codEvento/tipo configurado`,
              );
              throw new Error(
                `Fórmula ${execFunc.formula_id} sem codEvento/tipo configurado`,
              );
            }
            if (valor === null || valor === undefined) {
              this.logger.error(
                `Valor final nulo para fórmula ${execFunc.formula_id} do funcionário ${base.funcionario_id_rm}`,
              );
              throw new Error(
                `Valor final nulo para fórmula ${execFunc.formula_id} do funcionário ${base.funcionario_id_rm}`,
              );
            }

            const record = approved.record;

            if (!execFunc.metadados_rm_id) {
              await this.operacao.beginRmInsert(
                execucaoId, execFunc.execucao_funcionario_id, execFunc.revisao, approved.usuarioId, record,
              );
              this.logger.log(
                `processarEnviarRmBatch: salvando metadados para funcionário ${base.funcionario_id_rm}, Dados: ${JSON.stringify(record, null, 2)}`,
              );
              const resp = await this.rmService.saveRecordMetaData(
                dataServer,
                tableName,
                record,
                sessionId,
              );
              this.logger.log(
                `RM response: ${JSON.stringify(resp.data, null, 2)}`,
              );
              const insertedId = this.extractRmInsertedId(resp.data);
              if (!resp.status && resp.notSent) {
                await this.operacao.releaseRmInsert(execFunc.execucao_funcionario_id, execFunc.revisao);
                throw new Error(resp.message);
              }
              if (!resp.status || !insertedId)
                throw new Error('Aguardando confirmação do RM. Verifique se o evento foi gravado antes de reenviar.');

              await this.operacao.receipt(execFunc.execucao_funcionario_id, execFunc.revisao, insertedId, approved.usuarioId, record);
            } else {
              this.logger.log(
                `processarEnviarRmBatch: atualizando metadados para funcionário ${base.funcionario_id_rm}`,
              );
              await this.rmService.putRecordMetaData(
                dataServer,
                tableName,
                Number(execFunc.metadados_rm_id),
                record,
                sessionId,
              );
              await this.operacao.receipt(execFunc.execucao_funcionario_id, execFunc.revisao, Number(execFunc.metadados_rm_id), approved.usuarioId, record);
            }
          } catch (e) {
            this.logger.error(
              `Erro ao enviar para RM (func=${base.funcionario_id_rm}, formula=${execFunc.formula_id}): ${e instanceof Error ? e.message : String(e)}`,
            );
            //se tiver mensagem de erro no Rm mostra no log:
            teveErro = true;
            const msg = e instanceof Error ? e.message : String(e);
            await this.prisma.log_execucao.create({
              data: {
                execucao_id: execucaoId,
                nivel: 'ERROR',
                mensagem: `Erro ao enviar para RM (func=${base.funcionario_id_rm}, formula=${execFunc.formula_id}): ${msg}`,
              },
            });
            await this.appendExecucaoQueueLastError({
              execucaoId,
              execucaoFuncionarioBaseId: base.execucao_funcionario_base_id,
              tipo: 'ENVIAR_RM',
              line: formatQueueErrorLine({
                code: 'ERRO_ENVIAR_RM',
                message: msg,
                context: {
                  funcionario: base.funcionario_id_rm,
                  formulaId: execFunc.formula_id,
                },
              }),
            });
          }
        }

        if (teveErro) {
          basesComErro.push(base.execucao_funcionario_base_id);
        } else {
          basesOk.push(base.execucao_funcionario_base_id);
        }
      }

      if (basesOk.length > 0) {
        await this.prisma.execucao_funcionario_base.updateMany({
          where: { execucao_funcionario_base_id: { in: basesOk } },
          data: { status: ExecucaoService.STATUS_FUNC_BASE.ENVIADO_RM },
        });
      }
      if (basesComErro.length > 0) {
        await this.prisma.execucao_funcionario_base.updateMany({
          where: { execucao_funcionario_base_id: { in: basesComErro } },
          data: { status: ExecucaoService.STATUS_FUNC_BASE.ERRO_RM },
        });
      }

      return { status: true, message: 'Envio para RM concluído' };
    } catch (error) {
      this.logger.error(
        `Erro ao enviar para RM: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: false, message: 'Erro ao enviar para RM' };
    }
  }

  async getExecucaoQueueStatus(execucaoId: number): Promise<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        pending: number;
        processing: number;
        next_run_at: Date | null;
      }>
    >(
      Prisma.sql`
      SELECT
        SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'PROCESSANDO' THEN 1 ELSE 0 END) as processing,
        MIN(next_run_at) as next_run_at
      FROM dbo.execucao_queue
      WHERE execucao_id = ${execucaoId}
        AND status IN ('PENDENTE','PROCESSANDO');
    `,
    );

    const pending = Number(rows?.[0]?.pending ?? 0);
    const processing = Number(rows?.[0]?.processing ?? 0);
    const nextRunAt = rows?.[0]?.next_run_at
      ? rows[0].next_run_at.toISOString()
      : null;

    return {
      hasRunning: pending + processing > 0,
      pending,
      processing,
      nextRunAt,
    };
  }

  async getExecucaoQueueItems(execucaoId: number): Promise<
    Array<{
      queueId: number;
      execucaoFuncionarioBaseId: number;
      nomeFuncionario: string;
      funcionarioIdRm: string;
      cargo: string;
      tipo: string;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        queue_id: number;
        execucao_funcionario_base_id: number;
        nome_funcionario: string;
        funcionario_id_rm: string;
        cargo: string;
        tipo: string;
        status: string;
        tentativas: number;
        next_run_at: Date | null;
        locked_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      Prisma.sql`
      SELECT
        q.queue_id,
        q.execucao_funcionario_base_id,
        q.tipo,
        q.status,
        q.tentativas,
        q.next_run_at,
        q.locked_at,
        q.created_at,
        q.updated_at,
        f.nome_funcionario,
        f.funcionario_id_rm,
        f.cargo
      FROM dbo.execucao_queue q
      INNER JOIN dbo.execucao_funcionario_base f
        ON f.execucao_funcionario_base_id = q.execucao_funcionario_base_id
      WHERE q.execucao_id = ${execucaoId}
        AND q.status IN ('PENDENTE','PROCESSANDO')
      ORDER BY
        CASE WHEN q.status = 'PROCESSANDO' THEN 0 ELSE 1 END,
        q.created_at ASC;
    `,
    );

    return (rows ?? []).map((row) => ({
      queueId: row.queue_id,
      execucaoFuncionarioBaseId: row.execucao_funcionario_base_id,
      nomeFuncionario: row.nome_funcionario,
      funcionarioIdRm: row.funcionario_id_rm,
      cargo: row.cargo,
      tipo: row.tipo,
      status: row.status,
      tentativas: row.tentativas,
      nextRunAt: row.next_run_at ? row.next_run_at.toISOString() : null,
      lockedAt: row.locked_at ? row.locked_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async getExecucaoErrors(execucaoId: number): Promise<
    Array<{
      id: string;
      source: 'QUEUE' | 'LOG';
      tipo: string | null;
      status: string | null;
      funcionarioIdRm: string | null;
      nomeFuncionario: string | null;
      message: string;
      createdAt: string;
    }>
  > {
    const queueRows = await this.prisma.$queryRaw<
      Array<{
        queue_id: number;
        tipo: string;
        status: string;
        last_error: string | null;
        created_at: Date;
        funcionario_id_rm: string;
        nome_funcionario: string;
      }>
    >(
      Prisma.sql`
      SELECT TOP 2000
        q.queue_id,
        q.tipo,
        q.status,
        q.last_error,
        q.created_at,
        f.funcionario_id_rm,
        f.nome_funcionario
      FROM dbo.execucao_queue q
      INNER JOIN dbo.execucao_funcionario_base f
        ON f.execucao_funcionario_base_id = q.execucao_funcionario_base_id
      WHERE q.execucao_id = ${execucaoId}
        AND q.last_error IS NOT NULL
      ORDER BY q.created_at DESC;
    `,
    );

    // NOTE: usamos queryRaw aqui para evitar inconsistências de schema/client do Prisma em alguns ambientes.
    const logRows = await this.prisma.$queryRaw<
      Array<{
        log_id: number;
        mensagem: string;
        data_log: Date;
      }>
    >(
      Prisma.sql`
      SELECT TOP 2000
        log_id,
        mensagem,
        data_log
      FROM dbo.log_execucao
      WHERE execucao_id = ${execucaoId}
        AND nivel = 'ERROR'
      ORDER BY data_log DESC;
    `,
    );

    const out: Array<{
      id: string;
      source: 'QUEUE' | 'LOG';
      tipo: string | null;
      status: string | null;
      funcionarioIdRm: string | null;
      nomeFuncionario: string | null;
      message: string;
      createdAt: string;
    }> = [];

    for (const r of queueRows ?? []) {
      out.push({
        id: `QUEUE-${r.queue_id}`,
        source: 'QUEUE',
        tipo: r.tipo ?? null,
        status: r.status ?? null,
        funcionarioIdRm: r.funcionario_id_rm ?? null,
        nomeFuncionario: r.nome_funcionario ?? null,
        message: String(r.last_error ?? '').trim(),
        createdAt: r.created_at.toISOString(),
      });
    }
    for (const r of logRows ?? []) {
      out.push({
        id: `LOG-${r.log_id}`,
        source: 'LOG',
        tipo: null,
        status: null,
        funcionarioIdRm: null,
        nomeFuncionario: null,
        message: String(r.mensagem ?? '').trim(),
        createdAt: r.data_log.toISOString(),
      });
    }

    out.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    return out;
  }

  private async appendExecucaoQueueLastError(params: {
    execucaoId: number;
    execucaoFuncionarioBaseId: number;
    tipo: 'VARIAVEIS' | 'VALORES' | 'ENVIAR_RM';
    line: string;
    onlyProcessing?: boolean;
  }): Promise<void> {
    const { execucaoId, execucaoFuncionarioBaseId, tipo, line } = params;
    if (!execucaoId || !execucaoFuncionarioBaseId || !tipo) return;
    const safeLine = String(line ?? '').trim();
    if (!safeLine) return;

    await this.prisma.$executeRaw(
      Prisma.sql`
      UPDATE dbo.execucao_queue
      SET
        last_error = COALESCE(last_error, '') + '\n' + ${safeLine},
        updated_at = SYSDATETIME()
      WHERE execucao_id = ${execucaoId}
        AND execucao_funcionario_base_id = ${execucaoFuncionarioBaseId}
        AND tipo = ${tipo}
        ${params.onlyProcessing ? Prisma.sql`AND status = 'PROCESSANDO'` : Prisma.empty};
    `,
    );
  }

  async enqueueCreateExecucaoBatch(params: {
    filialIds: number[];
    periodoId: number;
    usuarioId: number;
    sessionId: string;
    processarVariaveisEValores?: boolean;
  }): Promise<{ status: boolean; message: string; data?: unknown }> {
    try {
      const {
        filialIds,
        periodoId,
        usuarioId,
        sessionId,
        processarVariaveisEValores,
      } = params;
      if (!Array.isArray(filialIds) || filialIds.length === 0 ||
          filialIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
        return { status: false, message: 'Nenhuma filial selecionada' };
      }
      if (!Number.isSafeInteger(periodoId) || periodoId < 1) {
        return { status: false, message: 'Período inválido' };
      }

      let inserted = 0;
      const uniqueFiliais = [...new Set(filialIds)];
      for (const filialId of uniqueFiliais) {
        const queued = await this.prisma.$transaction(async (tx) => {
          await this.lockCreation(tx, filialId, periodoId);
          const scope = { filial_id: filialId, periodo_id: periodoId };
          if (await tx.execucao.findFirst({ where: scope, select: { execucao_id: true } })) return false;
          if (await tx.execucao_create_queue.findFirst({
            where: { ...scope, status: { in: ['PENDENTE', 'PROCESSANDO'] } },
            select: { queue_id: true },
          })) return false;
          await tx.execucao_create_queue.create({ data: {
            ...scope,
            usuario_execucao: usuarioId,
            session_id: sessionId,
            processar_variaveis_valores: Boolean(processarVariaveisEValores),
          } });
          return true;
        }, { timeout: 15_000 });
        if (queued) inserted++;
      }

      return {
        status: inserted > 0,
        message: inserted === 0
          ? 'As filiais selecionadas já têm execução ou estão na fila de criação.'
          : `${inserted} execução(ões) agendada(s).${inserted < uniqueFiliais.length ? ' As demais filiais já têm execução ou estão na fila.' : ''}`,
        data: { inserted, skipped: uniqueFiliais.length - inserted },
      };
    } catch (error) {
      console.error(error);
      return {
        status: false,
        message: 'Erro ao enfileirar criação de execuções',
      };
    }
  }

  async getExecucaoCreateQueueStatus(): Promise<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        pending: number;
        processing: number;
        next_run_at: Date | null;
      }>
    >(
      Prisma.sql`
      SELECT
        SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'PROCESSANDO' THEN 1 ELSE 0 END) as processing,
        MIN(next_run_at) as next_run_at
      FROM dbo.execucao_create_queue
      WHERE status IN ('PENDENTE','PROCESSANDO');
    `,
    );

    const pending = Number(rows?.[0]?.pending ?? 0);
    const processing = Number(rows?.[0]?.processing ?? 0);
    const nextRunAt = rows?.[0]?.next_run_at
      ? rows[0].next_run_at.toISOString()
      : null;

    return {
      hasRunning: pending + processing > 0,
      pending,
      processing,
      nextRunAt,
    };
  }

  async getExecucaoCreateQueueItems(): Promise<
    Array<{
      queueId: number;
      filialId: number;
      periodoId: number;
      usuarioExecucao: number;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        queue_id: number;
        filial_id: number;
        periodo_id: number;
        usuario_execucao: number;
        status: string;
        tentativas: number;
        next_run_at: Date | null;
        locked_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>
    >(
      Prisma.sql`
      SELECT TOP 200
        queue_id,
        filial_id,
        periodo_id,
        usuario_execucao,
        status,
        tentativas,
        next_run_at,
        locked_at,
        created_at,
        updated_at
      FROM dbo.execucao_create_queue
      WHERE status IN ('PENDENTE','PROCESSANDO')
      ORDER BY
        CASE WHEN status = 'PROCESSANDO' THEN 0 ELSE 1 END,
        created_at ASC;
    `,
    );

    return (rows ?? []).map((row) => ({
      queueId: row.queue_id,
      filialId: row.filial_id,
      periodoId: row.periodo_id,
      usuarioExecucao: row.usuario_execucao,
      status: row.status,
      tentativas: row.tentativas,
      nextRunAt: row.next_run_at ? row.next_run_at.toISOString() : null,
      lockedAt: row.locked_at ? row.locked_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async getExecucaoCreateQueueErrors(limit: number = 1000): Promise<
    Array<{
      queueId: number;
      filialId: number;
      filialNome: string | null;
      periodoId: number;
      periodoCompetencia: string | null;
      usuarioExecucao: number;
      status: string;
      tentativas: number;
      nextRunAt: string | null;
      lockedAt: string | null;
      createdAt: string;
      updatedAt: string;
      lastError: string;
    }>
  > {
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(limit, 5000) : 1000;

    const rows = await this.prisma.$queryRaw<
      Array<{
        queue_id: number;
        filial_id: number;
        filial_nome: string | null;
        periodo_id: number;
        periodo_competencia: string | null;
        usuario_execucao: number;
        status: string;
        tentativas: number;
        next_run_at: Date | null;
        locked_at: Date | null;
        created_at: Date;
        updated_at: Date;
        last_error: string | null;
      }>
    >(
      Prisma.sql`
      SELECT TOP (${Prisma.raw(String(safeLimit))})
        q.queue_id,
        q.filial_id,
        f.nome as filial_nome,
        q.periodo_id,
        p.competencia as periodo_competencia,
        q.usuario_execucao,
        q.status,
        q.tentativas,
        q.next_run_at,
        q.locked_at,
        q.created_at,
        q.updated_at,
        q.last_error
      FROM dbo.execucao_create_queue q
      LEFT JOIN dbo.filial f
        ON f.filial_id = q.filial_id
      LEFT JOIN dbo.periodo p
        ON p.periodo_id = q.periodo_id
      WHERE q.last_error IS NOT NULL
      ORDER BY q.updated_at DESC;
    `,
    );

    return (rows ?? []).map((r) => ({
      queueId: r.queue_id,
      filialId: r.filial_id,
      filialNome: r.filial_nome ?? null,
      periodoId: r.periodo_id,
      periodoCompetencia: r.periodo_competencia ?? null,
      usuarioExecucao: r.usuario_execucao,
      status: r.status,
      tentativas: r.tentativas,
      nextRunAt: r.next_run_at ? r.next_run_at.toISOString() : null,
      lockedAt: r.locked_at ? r.locked_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      lastError: String(r.last_error ?? '').trim(),
    }));
  }

  async editarResultado(execucaoId: number, execFuncId: number, resultado: Partial<execucao_funcionario> & {new_valor_final?: number; motivo_ajuste: string}, usuarioId: number): Promise<{status: boolean; message: string}> {
    return this.operacao.adjust(execucaoId, execFuncId, resultado.new_valor_final, resultado.motivo_ajuste, resultado.revisao, usuarioId);
  }
}
