import {
  Controller,
  Get,
  Param,
  UseGuards,
  Post,
  Body,
  Put,
  Query,
  Header,
} from '@nestjs/common';
import { ExecucaoService } from './execucao.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CurrentUserService } from 'src/auth/current-user.service';
import {
  execucao,
  execucao_funcionario,
  execucao_funcionario_base,
} from '@prisma/client';

@Controller()
export class ExecucaoController {
  constructor(
    private readonly execucaoService: ExecucaoService,
    private readonly currentUserService: CurrentUserService,
  ) {}

  @Get('filial/:filialId/execucao')
  @UseGuards(JwtAuthGuard)
  async getAllExecucoesByFilialId(
    @Param('filialId') filialId: number,
  ): Promise<execucao[]> {
    return await this.execucaoService.getAllExecucoesByFilialId(filialId);
  }
  @Get('execucao/:execucaoId')
  @UseGuards(JwtAuthGuard)
  async getExecucaoById(
    @Param('execucaoId') execucaoId: number,
  ): Promise<execucao> {
    return await this.execucaoService.getExecucaoById(execucaoId);
  }

  @Get('execucao/:execucaoId/queue/status')
  @UseGuards(JwtAuthGuard)
  async getExecucaoQueueStatus(
    @Param('execucaoId') execucaoId: number,
  ): Promise<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  }> {
    return await this.execucaoService.getExecucaoQueueStatus(
      Number(execucaoId),
    );
  }

  @Get('execucao/:execucaoId/queue/items')
  @UseGuards(JwtAuthGuard)
  async getExecucaoQueueItems(@Param('execucaoId') execucaoId: number): Promise<
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
    return await this.execucaoService.getExecucaoQueueItems(Number(execucaoId));
  }

  @Get('execucao/create-queue/status')
  @UseGuards(JwtAuthGuard)
  async getExecucaoCreateQueueStatus(): Promise<{
    hasRunning: boolean;
    pending: number;
    processing: number;
    nextRunAt: string | null;
  }> {
    const status = await this.execucaoService.getExecucaoCreateQueueStatus();
    return status;
  }

  @Get('execucao/create-queue/items')
  @UseGuards(JwtAuthGuard)
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
    const items = await this.execucaoService.getExecucaoCreateQueueItems();
    return items;
  }

  @Get('execucao/create-queue/errors')
  @UseGuards(JwtAuthGuard)
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getExecucaoCreateQueueErrors(@Query('limit') limit?: string): Promise<
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
    const take = Number(limit ?? 1000);
    const safeTake = Number.isFinite(take) && take > 0 ? take : 1000;
    const rows = await this.execucaoService.getExecucaoCreateQueueErrors(
      Math.min(safeTake, 5000),
    );
    return rows ?? [];
  }

  @Get('execucao/:execucaoId/errors')
  @UseGuards(JwtAuthGuard)
  @Header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  )
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getExecucaoErrors(@Param('execucaoId') execucaoId: number): Promise<
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
    return await this.execucaoService.getExecucaoErrors(Number(execucaoId));
  }

  @Post('filial/:filialId/execucao')
  @UseGuards(JwtAuthGuard)
  async createExecucao(
    @Param('filialId') filialId: number,
    @Body() execucao: Partial<execucao>,
  ): Promise<{ status: boolean; message: string; data?: unknown }> {
    const { sessionId, usuarioId } = this.currentUserService.getJwtPayload();
    const result = await this.execucaoService.createExecucao(
      filialId,
      execucao,
      usuarioId,
      sessionId,
    );
    if (!result.status) {
      return { status: false, message: result.message, data: result.data };
    }
    return {
      status: true,
      message: 'Execucao created successfully',
      data: result.data || undefined,
    };
  }

  @Post('filial/execucao/batch')
  @UseGuards(JwtAuthGuard)
  async enqueueCreateExecucaoBatch(
    //recebe um array de ids de filiais e o periodo id
    @Body()
    params: {
      filialIds: number[];
      periodoId: number;
      processarVariaveisEValores?: boolean;
    },
  ): Promise<{ status: boolean; message: string; data?: unknown }> {
    const { sessionId, usuarioId } = this.currentUserService.getJwtPayload();
    const result = await this.execucaoService.enqueueCreateExecucaoBatch({
      filialIds: params.filialIds,
      periodoId: params.periodoId,
      usuarioId,
      sessionId,
      processarVariaveisEValores: Boolean(params.processarVariaveisEValores),
    });
    return result;
  }
  @Post('execucao/:execucaoId/processar-todos')
  @UseGuards(JwtAuthGuard)
  async processarTodos(
    @Param('execucaoId') execucaoId: number,
  ): Promise<{ status: boolean; message: string }> {
    return await this.execucaoService.processarTodos(execucaoId);
  }

  @Post('execucao/:execucaoId/processar-valores-batch')
  @UseGuards(JwtAuthGuard)
  async processarValoresBatch(
    @Param('execucaoId') execucaoId: number,
    @Body() rows: execucao_funcionario_base[],
  ): Promise<{ status: boolean; message: string }> {
    return await this.execucaoService.processarValoresBatch(execucaoId, rows);
  }

  @Post('execucao/:execucaoId/enqueue-variaveis-batch')
  @UseGuards(JwtAuthGuard)
  async enqueueVariaveisBatch(
    @Param('execucaoId') execucaoId: number,
    @Body() ids: number[],
  ): Promise<{ status: boolean; message: string }> {
    const { sessionId } = this.currentUserService.getJwtPayload();
    return await this.execucaoService.enqueueVariaveisBatch(
      execucaoId,
      ids,
      sessionId,
    );
  }

  @Post('execucao/:execucaoId/processar-variaveis')
  @UseGuards(JwtAuthGuard)
  async processarVariaveis(
    @Param('execucaoId') execucaoId: number,
  ): Promise<{ status: boolean; message: string }> {
    const { sessionId } = this.currentUserService.getJwtPayload();
    return await this.execucaoService.processarVariaveis(execucaoId, sessionId);
  }

  /**
   * Processa as variáveis de um batch de funcionários
   * @param execucaoId - ID da execução
   * @param rows - Array de funcionários
   * @returns {Promise<{ status: boolean; message: string }>}
   * @deprecated Use processarVariaveisBatch instead
   */
  @Post('execucao/:execucaoId/processar-variaveis-batch')
  @UseGuards(JwtAuthGuard)
  async processarVariaveisBatch(
    @Param('execucaoId') execucaoId: number,
    @Body() rows: execucao_funcionario_base[],
  ): Promise<{ status: boolean; message: string }> {
    const { sessionId } = this.currentUserService.getJwtPayload();
    return await this.execucaoService.processarVariaveisBatch(
      execucaoId,
      rows,
      sessionId,
    );
  }

  @Post('execucao/:execucaoId/enqueue-valores-batch')
  @UseGuards(JwtAuthGuard)
  async enqueueValoresBatch(
    @Param('execucaoId') execucaoId: number,
    @Body() ids: number[],
  ): Promise<{ status: boolean; message: string }> {
    const { sessionId } = this.currentUserService.getJwtPayload();
    return await this.execucaoService.enqueueValoresBatch(
      execucaoId,
      ids,
      sessionId,
    );
  }

  @Post('execucao/:execucaoId/enqueue-enviar-rm-batch')
  @UseGuards(JwtAuthGuard)
  async enqueueEnviarRmBatch(
    @Param('execucaoId') execucaoId: number,
    @Body() ids: number[],
  ): Promise<{ status: boolean; message: string }> {
    const { sessionId } = this.currentUserService.getJwtPayload();
    return await this.execucaoService.enqueueEnviarRmBatch(
      execucaoId,
      ids,
      sessionId,
    );
  }

  @Post('execucao/enqueue-enviar-rm-by-execucoes')
  @UseGuards(JwtAuthGuard)
  async enqueueEnviarRmByExecucoes(
    @Body() body: { execucaoIds: number[] },
  ): Promise<{ status: boolean; message: string; data?: unknown }> {
    const { sessionId } = this.currentUserService.getJwtPayload();
    const result = await this.execucaoService.enqueueEnviarRmByExecucoes({
      execucaoIds: body.execucaoIds ?? [],
      sessionId,
    });
    return result;
  }

  @Put('execucao/:execucaoId/exec-func/:execFuncId/editar-resultado')
  @UseGuards(JwtAuthGuard)
  async editarResultado(
    @Param('execucaoId') execucaoId: number,
    @Param('execFuncId') execFuncId: number,
    @Body()
    resultado: Partial<execucao_funcionario> & {
      new_valor_final?: number;
      motivo_ajuste: string;
    },
  ): Promise<{ status: boolean; message: string }> {
    const { usuarioId } = this.currentUserService.getJwtPayload();
    return await this.execucaoService.editarResultado(
      execucaoId,
      execFuncId,
      resultado,
      usuarioId,
    );
  }
}
