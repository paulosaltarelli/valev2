import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperationalReportsService } from '../dash/operational-reports.service';
import { VariationLimitError, type VariationRow } from '../dash/operational-reports';
import type { AssistenteDto } from './assistente.dto';
import type { ResultadoAssistente } from './assistente-tipos';

export function competenciaAnterior(competencia:string){
  const [mes,ano]=competencia.split('/').map(Number);
  return mes===1?`12/${ano-1}`:`${String(mes-1).padStart(2,'0')}/${ano}`;
}
export function pedidoComparacaoHistorica(pergunta:string){
  const p=pergunta.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  return /compar|variac|diferenc|mudou|mudanc/.test(p)&&/competenc|periodo/.test(p)&&/\banterior\b|\bpassad[oa]\b/.test(p);
}

const comparaveis=new Set(['Com variação','Sem variação','Sem base percentual']);
export function resumirVariacao(rows:VariationRow[]){
  const comuns=rows.filter(r=>comparaveis.has(r.situacao));
  const monetarios=(polaridade:string)=>comuns.filter(r=>r.classificacaoMonetariaAtual&&r.classificacaoMonetariaAnterior&&r.polaridadeAtual===polaridade&&r.polaridadeAnterior===polaridade&&r.anterior!==null&&r.atual!==null);
  const valores=(rs:VariationRow[])=>{
    if(!rs.length)return [null,null,null] as const;
    const anterior=rs.reduce((n,r)=>n.plus(r.anterior!),new Prisma.Decimal(0));
    const atual=rs.reduce((n,r)=>n.plus(r.atual!),new Prisma.Decimal(0));
    return [anterior.toString(),atual.toString(),atual.minus(anterior).toString()] as const;
  };
  return {
    pago:valores(monetarios('+')),desconto:valores(monetarios('-')),
    comparaveis:comuns.length,
    comVariacao:comuns.filter(r=>r.diferenca!==null&&!new Prisma.Decimal(r.diferenca).isZero()).length,
    naoComparaveis:rows.length-comuns.length,
    regrasAlteradas:rows.filter(r=>r.situacao==='Fórmula alterada').length,
    versoesAlteradas:rows.filter(r=>r.situacao==='Fórmula alterada'&&r.versaoAnterior!==null&&r.versaoAtual!==null&&r.versaoAnterior!==r.versaoAtual).length,
    historicoAusente:rows.filter(r=>r.situacao==='Regra não verificável').length,
    classificacaoAusente:comuns.filter(r=>r.tipoAnteriorHistorico===null||r.tipoAtualHistorico===null||r.tipoAtualHistorico==='V'&&(!r.classificacaoMonetariaAnterior||!r.classificacaoMonetariaAtual)).length,
    semFormula:rows.filter(r=>['Sem fórmula anterior','Sem fórmula atual'].includes(r.situacao)).length,
    semCalculoOuErro:rows.filter(r=>['Sem cálculo','Erro de cálculo'].includes(r.situacao)).length,
    ambiguos:rows.filter(r=>['Matrícula duplicada','Fórmula ambígua'].includes(r.situacao)).length,
    semBasePercentual:rows.filter(r=>r.situacao==='Sem base percentual').length,
  };
}

type Cell=string|number|null;
const colunas=[
  'Filial','Pago calculado comparável anterior','Pago calculado comparável atual','Diferença do pago comparável',
  'Desconto calculado comparável anterior','Desconto calculado comparável atual','Diferença do desconto comparável',
  'Funcionários anteriores na filial','Funcionários atuais na filial','Presentes em ambas as populações','Só na atual','Só na anterior',
  'Resultados comparáveis','Resultados com variação','Resultados não comparáveis','Resultados com regra alterada','Resultados com versão alterada',
  'Histórico não verificável','Classificação histórica ausente','Sem fórmula correspondente','Sem cálculo ou com erro','Registros ambíguos','Sem base percentual',
  'Situação','Observações','Execução anterior','Execução atual',
];

@Injectable()
export class AssistenteComparacao {
  constructor(private readonly prisma:PrismaService,private readonly relatorios:OperationalReportsService){}

  async responder(input:AssistenteDto,perfil:string):Promise<ResultadoAssistente>{
    if(!['admin','operator'].includes(perfil))throw new ForbiddenException();
    const inicio=new Date().toISOString(),opcoes=await this.relatorios.options();
    const atual=input.periodoId?opcoes.periodos.find(p=>p.periodo_id===input.periodoId&&p.ativo):opcoes.periodos.find(p=>p.ativo);
    if(!atual)throw new BadRequestException('Não há competência ativa compatível com a comparação.');
    const anterior=competenciaAnterior(atual.competencia),prev=opcoes.periodos.find(p=>p.competencia===anterior);
    const explicitas=input.pergunta.match(/\b\d{2}\/\d{4}\b/g)??[];
    if(explicitas.some(p=>![atual.competencia,anterior].includes(p)))throw new BadRequestException('Este comparativo usa a competência ativa e o mês imediatamente anterior.');
    const filiais=opcoes.filiais.filter(f=>f.ativa&&(!input.filialId||f.filial_id===input.filialId));
    if(!filiais.length)throw new BadRequestException('Filial não disponível para esta comparação.');
    if(filiais.length>100)throw new BadRequestException('O limite de filiais impede uma comparação completa.');
    const runs=await this.prisma.execucao.findMany({where:{periodo_id:{in:[atual.periodo_id,...(prev?[prev.periodo_id]:[])]},filial_id:{in:filiais.map(f=>f.filial_id)}},select:{execucao_id:true,filial_id:true,periodo_id:true,historica_de_execucao_id:true},take:2001});
    if(runs.length>2000)throw new BadRequestException('O limite de execuções impede verificar duplicidades com segurança.');
    const ids=runs.map(r=>r.execucao_id);
    const [tamanhos,processando,pendentes]=ids.length?await Promise.all([
      this.prisma.execucao_funcionario.groupBy({by:['execucao_id'],where:{execucao_id:{in:ids}},_count:true}),
      this.prisma.execucao_queue.groupBy({by:['execucao_id'],where:{execucao_id:{in:ids},status:'PROCESSANDO'},_count:true}),
      this.prisma.execucao_queue.groupBy({by:['execucao_id'],where:{execucao_id:{in:ids},status:'PENDENTE'},_count:true}),
    ]):[[],[],[]];
    let parcial=false;const linhas:Cell[][]=[];
    const vazio=(nome:string,estado:string,nota:string,a:string|null,b:string|null):Cell[]=>[nome,...Array<Cell>(22).fill(null),estado,nota,b,a];
    for(const filial of filiais){
      const a=runs.filter(r=>!r.historica_de_execucao_id&&r.filial_id===filial.filial_id&&r.periodo_id===atual.periodo_id),b=runs.filter(r=>!r.historica_de_execucao_id&&r.filial_id===filial.filial_id&&r.periodo_id===prev?.periodo_id);
      const historicas=runs.filter(r=>r.historica_de_execucao_id&&r.filial_id===filial.filial_id);
      const aid=a.length?a.map(r=>r.execucao_id).join(', '):null,bid=b.length?b.map(r=>r.execucao_id).join(', '):null;
      if(a.length>1||b.length>1){linhas.push(vazio(filial.nome,'Execuções duplicadas','Nenhuma execução foi escolhida para consolidar a comparação.',aid,bid));continue;}
      if(!prev||!a.length||!b.length){linhas.push(vazio(filial.nome,!prev?'Competência anterior não cadastrada':!a.length?'Sem execução atual':'Sem execução anterior','Não é possível inferir valores ou mudanças de população a partir de uma execução ausente.',aid,bid));continue;}
      const pair=[a[0].execucao_id,b[0].execucao_id];
      if(processando.some(x=>pair.includes(x.execucao_id))){parcial=true;linhas.push(vazio(filial.nome,'Em processamento','A comparação desta filial foi adiada para não combinar leituras durante um lote ativo.',aid,bid));continue;}
      if(tamanhos.filter(x=>pair.includes(x.execucao_id)).reduce((n,x)=>n+x._count,0)>16000){parcial=true;linhas.push(vazio(filial.nome,'Limite de leitura','Os resultados desta filial excedem o limite seguro de investigação histórica.',aid,bid));continue;}
      try{
        const populacao=await this.prisma.execucao_funcionario_base.findMany({where:{execucao_id:{in:pair}},select:{execucao_id:true,codcoligada:true,funcionario_id_rm:true},take:4001});
        if(populacao.length>4000)throw new VariationLimitError();
        const pessoas=(id:number)=>new Set(populacao.filter(p=>p.execucao_id===id).map(p=>JSON.stringify([p.codcoligada,p.funcionario_id_rm.trim()])));
        const now=pessoas(pair[0]),before=pessoas(pair[1]);
        const variacao=await this.relatorios.variation(atual.periodo_id,prev.periodo_id,filial.filial_id,10000);
        if(variacao.execucaoAtual!==pair[0]||variacao.execucaoAnterior!==pair[1]){parcial=true;linhas.push(vazio(filial.nome,'Execuções alteradas','As execuções mudaram durante a consulta; esta filial não foi consolidada.',aid,bid));continue;}
        const s=resumirVariacao(variacao.rows),fila=pendentes.some(x=>pair.includes(x.execucao_id));
        const notas=[
          historicas.length?'Execuções históricas preservadas: '+historicas.map(h=>'#'+h.execucao_id+' → principal #'+h.historica_de_execucao_id).join('; ')+'. Não entram novamente na consolidação.':'',
          'Valores calculados; base comparável restrita à mesma pessoa, regra e versão verificáveis. Valores ajustados e registros de envio ao RM não entram nesta soma.',
          s.regrasAlteradas?`${s.regrasAlteradas} resultado(s) com regra alterada excluídos das diferenças comparáveis.`:'',
          s.historicoAusente||s.classificacaoAusente?'Há histórico ou classificação monetária não verificável; não foram substituídos pelo cadastro atual.':'',
          s.ambiguos?'Registros ambíguos não tiveram diferenças consolidadas.':'',
          fila?'Há fila pendente: a comparação inclui apenas os valores persistidos disponíveis.':'',
        ].filter(Boolean).join(' ');
        linhas.push([filial.nome,...s.pago,...s.desconto,before.size,now.size,[...now].filter(p=>before.has(p)).length,[...now].filter(p=>!before.has(p)).length,[...before].filter(p=>!now.has(p)).length,
          s.comparaveis,s.comVariacao,s.naoComparaveis,s.regrasAlteradas,s.versoesAlteradas,s.historicoAusente,s.classificacaoAusente,s.semFormula,s.semCalculoOuErro,s.ambiguos,s.semBasePercentual,
          fila?'Base em andamento':s.naoComparaveis||s.historicoAusente||s.classificacaoAusente?'Comparação com ressalvas':'Comparação disponível',notas,pair[1],pair[0]]);
      }catch(e){parcial=true;linhas.push(vazio(filial.nome,e instanceof VariationLimitError?'Limite de comparação':'Falha na leitura histórica','A comparação desta filial ficou indisponível; nenhum valor foi preenchido por hipótese.',aid,bid));}
    }
    const temPago=linhas.some(r=>r[3]!==null);
    return {
      texto:`Comparação de ${atual.competencia} com ${anterior}, por filial. ${filiais.length} filial(is) no recorte. As diferenças monetárias incluem somente resultados calculados com pessoa, fórmula e versão comparáveis; confira as ressalvas.`,
      competencia:`${atual.competencia} × ${anterior}`,filial:input.filialId?filiais[0].nome:'Todas as filiais ativas',consultadoEm:inicio,
      fonte:'Relatório de variação do Vale · snapshots históricos de fórmulas, versões e população · valores calculados',
      detalhes:'Atual: '+atual.competencia+'. Anterior: '+anterior+'. A competência anterior é o mês de calendário imediatamente anterior, mesmo quando inativa. Cada filial precisa ter uma única execução em cada período. Pessoas são identificadas por coligada + matrícula, sem nomes no relatório agregado. Entrada/saída na população não confirma admissão ou desligamento. As contagens de resultados são por funcionário e fórmula; mudanças de regra e versão podem se sobrepor. Fórmulas monetárias são classificadas exclusivamente por snapshots verificáveis (tipo V e polaridade + ou -). Dias e demais unidades não são somados a reais. Ausência de base comparável é —; zero calculado continua zero. Não há conciliação com RM nem atribuição causal automática. Cada linha é um snapshot de leitura da filial; filiais em lote ativo são sinalizadas e não consolidadas.',
      tabela:{colunas,linhas,parcial},
      apresentacao:{titulo:`Comparativo histórico · ${atual.competencia} × ${anterior}`,grafico:'barras',dimensao:'Filial',metrica:temPago?'Diferença do pago comparável':'Resultados não comparáveis'},
      links:[{texto:'Variação por competência',url:'/variacao-competencias'},{texto:'Processamentos',url:'/processamento'},...runs.filter(r=>r.historica_de_execucao_id).map(r=>({texto:'Histórica #'+r.execucao_id+' · principal #'+r.historica_de_execucao_id,url:'/processamento/'+r.execucao_id}))],
    };
  }
}
