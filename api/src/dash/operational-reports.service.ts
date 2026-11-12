import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { closingCounts, variationRows } from './operational-reports';

const personSelect = {
  funcionario_id_rm: true, codcoligada: true, nome_funcionario: true, status: true, regras_rm: true,
  execucao_funcionario: { select: {
    status: true, valor_calculado: true, valor_final: true, codigo_regra_rm: true, revisao: true, enviado_revisao: true, formula_snapshot: true,
    formula: { select: { formula_id: true, nome: true, versao: true, tipo: true, expressao: true, codEvento: true, polaridade: true } },
    _count: { select: { memoria_calculo: true } },
  } },
} as const;
const executionSelect = {
  execucao_id:true,filial_id:true,controle_fila:true,
  filial:{select:{formula:{where:{ativa:true},select:{formula_id:true}}}},
  execucao_funcionario_base:{select:personSelect},
  execucao_queue:{where:{status:{in:['PENDENTE','PROCESSANDO']}},select:{status:true,tipo:true}},
} satisfies Prisma.execucaoSelect;
type ReportExecution = Prisma.execucaoGetPayload<{ select: typeof executionSelect }>;

@Injectable()
export class OperationalReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async options() {
    const [periodos, filiais] = await Promise.all([
      this.prisma.periodo.findMany({orderBy: [{data_inicio:'desc'},{periodo_id:'desc'}],
        select:{periodo_id:true, competencia:true, ativo:true, data_inicio:true}}),
      this.prisma.filial.findMany({orderBy:{nome:'asc'},select:{filial_id:true,nome:true,ativa:true}}),
    ]);
    return {periodos,filiais};
  }

  private async latest(periodoId: number, filialId?: number): Promise<ReportExecution[]> {
    const groups = await this.prisma.execucao.groupBy({by:['filial_id'],
      where:{historica_de_execucao_id:null,periodo_id:periodoId, ...(filialId ? {filial_id:filialId} : {})},_max:{execucao_id:true}});
    const ids = groups.flatMap(g=>g._max.execucao_id ? [g._max.execucao_id] : []);
    return ids.length ? this.prisma.execucao.findMany({where:{execucao_id:{in:ids}},
      select:executionSelect}) : [];
  }

  async closing(periodoId?: number) {
    const options = await this.options();
    const periodo = periodoId ? options.periodos.find(p=>p.periodo_id===periodoId) :
      options.periodos.find(p=>p.ativo) ?? options.periodos[0];
    if (periodoId && !periodo) throw new NotFoundException('Competência não encontrada.');
    if (!periodo) return {...options,periodo:null,rows:[],updatedAt:new Date()};
    const [executions, creation] = await Promise.all([
      this.latest(periodo.periodo_id),
      this.prisma.execucao_create_queue.findMany({where:{periodo_id:periodo.periodo_id},
        orderBy:{queue_id:'desc'},select:{filial_id:true,status:true}}),
    ]);
    const byBranch = new Map(executions.map(e=>[e.filial_id,e] as const));
    const creationByBranch = new Map<number,string>();
    for (const item of creation) if (!creationByBranch.has(item.filial_id)) creationByBranch.set(item.filial_id,item.status);
    const rows = options.filiais.filter(f=>f.ativa || byBranch.has(f.filial_id)).map(f=>{
      const e = byBranch.get(f.filial_id);
      const counts = e ? closingCounts(e.execucao_funcionario_base, e.filial.formula.map(f=>f.formula_id)) : null;
      const creationStatus = creationByBranch.get(f.filial_id);
      const running = e?.execucao_queue.some(q=>q.status==='PROCESSANDO');
      const pending = e?.execucao_queue.some(q=>q.status==='PENDENTE');
      const situacao = !e ? (['PENDENTE','PROCESSANDO'].includes(creationStatus ?? '') ? 'Preparando execução' : creationStatus==='ERRO' ? 'Falha na criação' : 'Sem execução') :
        running ? 'Em andamento' : e.controle_fila==='PAUSADA' ? 'Fila pausada' : e.controle_fila==='CANCELADA' ? 'Fila cancelada' :
        pending ? 'Na fila' : !counts!.total ? 'Sem funcionários' : counts!.comErro ? 'Exige ação' :
        counts!.enviados===counts!.total ? 'Enviado ao RM' : counts!.completos===counts!.total ? 'Cálculo concluído' : 'Cálculo pendente';
      return {filialId:f.filial_id,filial:f.nome,ativa:f.ativa,execucaoId:e?.execucao_id ?? null,situacao,counts};
    });
    return {...options,periodo:periodo.periodo_id,rows,updatedAt:new Date()};
  }

  private async variationExecutions(periodoId:number,filialId:number){
    // Variation does not use memory counts. Keep the closing reader unchanged.
    const { _count: unused, ...resultSelect }=personSelect.execucao_funcionario.select;
    void unused;
    const rows=await this.prisma.execucao.findMany({where:{periodo_id:periodoId,filial_id:filialId,historica_de_execucao_id:null},select:{execucao_id:true,execucao_funcionario_base:{select:{...personSelect,execucao_funcionario:{select:resultSelect}}}},take:2});
    if(rows.length>1)throw new BadRequestException('Execuções duplicadas sem referência principal.');
    return rows;
  }

  async variation(periodoId: number, anteriorId: number, filialId: number, maxRows?: number, preparedOptions?: Awaited<ReturnType<OperationalReportsService['options']>>) {
    const options = preparedOptions ?? await this.options();
    const periodo = options.periodos.find(p=>p.periodo_id===periodoId);
    const anterior = options.periodos.find(p=>p.periodo_id===anteriorId);
    const filial = options.filiais.find(f=>f.filial_id===filialId);
    if (!periodo || !anterior || !filial) throw new NotFoundException('Competência ou filial não encontrada.');
    if (anterior.data_inicio >= periodo.data_inicio) throw new BadRequestException('Selecione uma competência anterior à atual.');
    const [current, previous, configured] = await Promise.all([
      this.variationExecutions(periodoId,filialId),this.variationExecutions(anteriorId,filialId),
      this.prisma.formula.findMany({where:{filial_id:filialId,ativa:true},
        select:{formula_id:true,nome:true,versao:true,tipo:true,expressao:true,codEvento:true,polaridade:true}}),
    ]);
    const a=current[0],b=previous[0];
    return {
      periodo:periodo.competencia,anterior:anterior.competencia,filial:filial.nome,
      execucaoAtual:a?.execucao_id ?? null,execucaoAnterior:b?.execucao_id ?? null,
      rows:variationRows(a?.execucao_funcionario_base ?? [],b?.execucao_funcionario_base ?? [],!!a,!!b,configured,maxRows),
      updatedAt:new Date(),
    };
  }
}
