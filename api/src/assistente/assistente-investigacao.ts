import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { analisarExpressao } from '../helpers/calculator/formula-expression';
import { lerSnapshotFormula } from '../dash/operational-reports';
import { classificarLog, situacaoValor } from './assistente-consultas';
import { AssistenteConhecimento } from './assistente-conhecimento';
import { consultarModelo } from './assistente-intencao';
import { classificarFalhaIndividual, temRecusaDuplicidadeHistorica, criarAuditoria, formatarAuditoria, interpretarParaUsuario, validarSelecao, type AchadoAuditavel, type FatosAuditaveis } from './assistente-auditoria';
import { promptSugerido, regrasFixas } from './assistente-prompt';
import {
  contextoConsulta,
  respostaParaModelo,
  type ContextoErros,
  type ResultadoAssistente,
} from './assistente-tipos';

const fatosInternos = Symbol('fatos-investigacao');
type ResultadoFatos = ResultadoAssistente & {
  [fatosInternos]?: Record<string, unknown>;
};

function contextoDoDiagnostico(dados: ResultadoFatos) {
  const fatos=dados[fatosInternos];
  const resultados=(fatos?.resultados??[]) as {formulaId:number;formula:string;versaoHistorica:number|null;status:string;calculado:string|null;variaveisComMemoria:string[];variaveisHistoricasSemMemoria:string[]|null;variaveisIdentificadas?:{codigo:string;nome:string|null}[]}[];
  const afetados=resultados.filter(r=>r.status==='ERRO'||r.calculado===null);
  const foco=(afetados.length?afetados:resultados).slice(0,8);
  const formulas=foco.map(r=>`${r.formula} (#${r.formulaId}; versão histórica ${r.versaoHistorica??'não identificada'}; estado ${r.status})`).join('; ')||'Fórmula não identificada nos registros disponíveis.';
  const memorias=[...new Set(foco.flatMap(r=>(r.variaveisIdentificadas??r.variaveisComMemoria.map(codigo=>({codigo,nome:null}))).map(v=>v.codigo+(v.nome?' — '+v.nome:''))))];
  const ausentes=[...new Set(foco.flatMap(r=>r.variaveisHistoricasSemMemoria??[]))];
  const logs=(fatos?.logsHistoricos??[]) as {alvo?:string;codigo?:string;variavel?:string}[];
  const erros=[...new Set(logs.flatMap(l=>[...(l.alvo==='Variável'&&l.codigo?[l.codigo]:[]),...(l.variavel?[l.variavel]:[])]))];
  const variaveis=[erros.length?'Variáveis citadas em erros históricos: '+erros.join(', ')+'.':'Nenhuma variável identificada em log de erro reconhecido.',
    memorias.length?'Com memória nas fórmulas listadas: '+memorias.slice(0,40).join(', ')+(memorias.length>40?' (limitado às primeiras 40)':'')+'.':'Não há variável com memória identificada nas fórmulas listadas.',
    ausentes.length?'Dependências históricas sem memória: '+ausentes.slice(0,40).join(', ')+'. Ausência de memória não comprova falha no RM.':''].filter(Boolean).join(' ');
  return {formulas:formulas+((afetados.length||resultados.length)>8?' Detalhe textual limitado a 8 fórmulas; consulte a tabela e os registros da execução.':''),variaveis};
}

function etapaDoEstado(status:string|null){
  return status?.includes('VARIAVEIS')?'Variáveis':status?.includes('RESULTADO')?'Valores/fórmulas':status==='ERRO_RM'?'Envio ao RM':'Etapa não identificada no estado atual';
}

function evidenciaDoCaso(dados: ResultadoFatos) {
  const logs = dados[fatosInternos]?.logsHistoricos;
  if (!Array.isArray(logs) || !logs.length)
    return 'Não há log histórico reconhecido que confirme uma causa específica.';
  return (
    'Evidência histórica: ' +
    logs
      .slice(0, 2)
      .map(
        (l: { codigo?: string; evidencia: string; data: string }) =>
          l.evidencia +
          (l.codigo ? ' Código relacionado: ' + l.codigo + '.' : '') +
          ' Registro: ' +
          l.data +
          '.',
      )
      .join(' ') +
    ' Não comprova, sozinha, a causa atual.'
  );
}
type PessoaInvestigacao = {
  execucao_funcionario_base_id: number;
  funcionario_id_rm: string;
  nome_funcionario: string | null;
  status: string | null;
  execucao: {
    execucao_id: number;
    filial_id: number;
    filial: { nome: string };
  };
};

export function resumirLogInvestigacao(mensagem: string, matricula: string) {
  const conhecido = classificarLog(mensagem);
  if (conhecido?.matricula === matricula)
    return {
      tipo: 'Log histórico',
      alvo: mensagem.startsWith('Sem memoria_calculo') ? 'Fórmula' : 'Variável',
      codigo: conhecido.codigo,
      evidencia: conhecido.causa,
    };
  const calculo =
    /^Erro ao calcular fórmula (\d+) para funcionário ([^:\r\n]+):/.exec(
      mensagem,
    );
  if (calculo?.[2] === matricula) {
    const simbolo = /Undefined symbol ([A-Za-z_][A-Za-z0-9_]{0,49})\b/.exec(
      mensagem,
    );
    const evidencia = simbolo
      ? `A calculadora registrou símbolo não definido: ${simbolo[1]}.`
      : /A fórmula deve retornar um número finito/.test(mensagem)
        ? 'A calculadora registrou que a fórmula não retornou um número finito.'
        : /Unexpected operator|Unexpected end|Parenthesis .* expected|Value expected/.test(
              mensagem,
            )
          ? 'A calculadora registrou erro de sintaxe na expressão.'
          : 'A calculadora rejeitou o cálculo desta fórmula. O detalhe técnico não foi exposto automaticamente.';
    return {
      tipo: 'Log histórico',
      alvo: 'Fórmula',
      codigo: calculo[1],
      ...(simbolo?{variavel:simbolo[1]}:{}),
      evidencia,
    };
  }
  const inesperado =
    /^Erro inesperado ao processar valores do funcionário ([^:\r\n]+):/.exec(
      mensagem,
    );
  if (inesperado?.[1] === matricula)
    return {
      tipo: 'Log histórico',
      evidencia:
        'Foi registrada falha inesperada no processamento de valores; a mensagem não confirma uma causa específica.',
    };
  return null;
}

@Injectable()
export class AssistenteInvestigacao {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conhecimento: AssistenteConhecimento,
  ) {}

  async responderGrupo(
    grupo: ContextoErros,
    provedor: 'claude' | 'gpt-institucional',
    credencial: { modelo: string; chave: string },
    contexto?: string | null,
    objetivo?: 'prioridade'|'causas'|'nomes',
  ): Promise<ResultadoAssistente> {
    const consultadoEm = new Date().toISOString();
    const base = {
      competencia: grupo.competencia,
      filial: grupo.filial,
      consultadoEm,
      [contextoConsulta]: grupo,
      fonte: 'Banco do Vale · grupo da consulta anterior',
    };
    const periodo = await this.prisma.periodo.findUnique({
      where: { periodo_id: grupo.periodoId },
      select: { ativo: true },
    });
    if (!periodo?.ativo)
      return {
        ...base,
        texto:
          'A competência do grupo consultado não está mais ativa. Não alterei o recorte nem escolhi outra competência.',
      };
    if (!grupo.funcionarioBaseIds.length)
      return {
        ...base,
        texto: grupo.total
          ? 'Não foi possível preservar os registros deste grupo. Consulte novamente o panorama de erros.'
          : 'A consulta anterior não encontrou funcionários com erro nos registros sem duplicidade.',
      };
    const runs = await this.prisma.execucao.findMany({
      where: { historica_de_execucao_id:null,
        periodo_id: grupo.periodoId,
        filial: { ativa: true },
        ...(grupo.filialId ? { filial_id: grupo.filialId } : {}),
      },
      select: { execucao_id: true, filial_id: true },
      take: 2001,
    });
    if (runs.length > 2000)
      return {
        ...base,
        texto:
          'O limite de execuções impede verificar duplicidades com segurança. Não escolhi uma execução para diagnosticar.',
      };
    const permitidas = runs
      .filter(
        (r) =>
          grupo.execucaoIds.includes(r.execucao_id) &&
          runs.filter((x) => x.filial_id === r.filial_id).length === 1,
      )
      .map((r) => r.execucao_id);
    const pessoas = await this.prisma.execucao_funcionario_base.findMany({
      where: {
        execucao_id: { in: permitidas },
        execucao_funcionario_base_id: {
          in: grupo.funcionarioBaseIds.slice(0, 20),
        },
      },
      select: {
        execucao_funcionario_base_id: true,
        funcionario_id_rm: true,
        nome_funcionario: true,
        status: true,
        execucao: {
          select: {
            execucao_id: true,
            filial_id: true,
            filial: { select: { nome: true } },
          },
        },
      },
      orderBy: { execucao_funcionario_base_id: 'asc' },
      take: 20,
    });
    const casos: {
      referencia: string;
      pessoa: PessoaInvestigacao;
      dados: ResultadoFatos;
      leituraFalhou: boolean;
    }[] = [];
    for (let i = 0; i < pessoas.length; i += 2) {
      const lote = pessoas.slice(i, i + 2);
      const resultado = await Promise.allSettled(
        lote.map((p) =>
          this.analisar(
            p,
            {
              periodoId: grupo.periodoId,
              competencia: grupo.competencia,
              filialId: p.execucao.filial_id,
            },
            {
              competencia: grupo.competencia,
              consultadoEm,
              filial: p.execucao.filial.nome,
              fonte: 'Banco do Vale · investigação por funcionário',
            },
            provedor,
            credencial,
            contexto,
            false,
          ),
        ),
      );
      resultado.forEach((r, j) =>
        casos.push({
          referencia: 'Caso ' + (i + j + 1),
          pessoa: lote[j],
          leituraFalhou: r.status === 'rejected',
          dados:
            r.status === 'fulfilled'
              ? r.value
              : {
                  texto:
                    'Não foi possível consultar as evidências deste funcionário. Não há causa confirmada.',
                },
        }),
      );
    }
    const codigo = this.conhecimento.investigacao();
    const explicacoes = new Map<string, string>();
    let sinteseFalhou = false;
    const catalogos=new Map<string,AchadoAuditavel[]>(casos.map(c=>[c.referencia,criarAuditoria(c.dados[fatosInternos] as FatosAuditaveis|undefined,codigo.trechos)]));
    const selecoesValidadas=new Set<string>();
    if(casos.length)try{
      const texto=await consultarModelo(provedor,credencial,regrasFixas+'\n'+(contexto||promptSugerido)+'\nPriorize os achados fornecidos por referência. Retorne apenas IDs existentes, no máximo 12 por caso. Não escreva explicações, causas, hipóteses ou instruções novas. O Vale renderiza os textos e todas as limitações a partir das evidências.',
        JSON.stringify({casos:Object.fromEntries(catalogos),codigo:codigo.trechos}),1800,
        {nome:'vale_ia_grupo_erros',schema:{type:'object',properties:{casos:{type:'object',properties:Object.fromEntries([...catalogos].map(([id,achados])=>[id,{type:'array',items:{type:'string',enum:achados.map(a=>a.id)},maxItems:12}])),required:casos.map(c=>c.referencia),additionalProperties:false}},required:['casos'],additionalProperties:false}});
      const plano=JSON.parse(texto) as {casos?:Record<string,unknown>};
      if(!plano||Object.keys(plano).length!==1||!plano.casos||Array.isArray(plano.casos)||Object.keys(plano.casos).length!==casos.length)throw new Error('Invalid group references');
      for(const [referencia,ids]of Object.entries(plano.casos)){
        const catalogo=catalogos.get(referencia);if(!catalogo)throw new Error('Unknown case');
        const validos=validarSelecao(catalogo,ids);explicacoes.set(referencia,formatarAuditoria(catalogo,validos));selecoesValidadas.add(referencia);
      }
    }catch{explicacoes.clear();selecoesValidadas.clear();sinteseFalhou=true;}
    for(const [referencia,catalogo]of catalogos)if(!explicacoes.has(referencia))explicacoes.set(referencia,formatarAuditoria(catalogo));
    const parcial =
      grupo.parcial ||
      casos.length !== grupo.total ||
      casos.some((c) => c.leituraFalhou || c.dados.tabela?.parcial);
    const links = [
      ...new Set(casos.map((c) => c.pessoa.execucao.execucao_id)),
    ].map((id) => ({
      texto: 'Abrir execução ' + id,
      url: '/processamento/' + id,
    }));
    const filiaisDoGrupo=[...new Set(casos.map(c=>c.pessoa.execucao.filial.nome))];
    const interpretacoes=[...new Set(casos.map(c=>interpretarParaUsuario(c.dados[fatosInternos],catalogos.get(c.referencia)??[])))];
    const lista=casos.map(c=>`• ${c.pessoa.nome_funcionario??'Nome não informado'} (matrícula ${c.pessoa.funcionario_id_rm})${filiaisDoGrupo.length>1?' — '+c.pessoa.execucao.filial.nome:''}`).join('\n');
    const introducao=objetivo==='nomes'?'São estes os funcionários do grupo que acabamos de consultar:':objetivo==='prioridade'?'Eu começaria conferindo a última tentativa antes de repetir o processamento.':objetivo==='causas'?'Conferi os registros desse mesmo grupo. Isto é o que eles permitem explicar:':`Encontrei ${casos.length} ${casos.length===1?'funcionário no grupo de erros':'funcionários no grupo de erros'}${filiaisDoGrupo.length===1?' em '+filiaisDoGrupo[0]:', em '+filiaisDoGrupo.length+' filiais'}, na competência ${grupo.competencia}.`;
    const conversa=introducao+(objetivo&&objetivo!=='nomes'?'':'\n\n'+(objetivo==='nomes'?'':'São estes:\n')+lista)+(objetivo==='nomes'?'\n\nAs situações e orientações de cada um estão nos detalhes.':'\n\n'+interpretacoes.slice(0,3).map((t,i)=>interpretacoes.length>1?`Situação ${i+1}: ${t}`:t).join('\n\n')+(interpretacoes.length>3?'\n\nHá outras situações nos detalhes de cada funcionário.':'')+'\n\nDeixei os links das execuções abaixo para você conferir a tentativa de cada caso.')+(parcial?' Estou mostrando apenas os registros que consegui analisar; a consulta está parcial.':'');
    return {
      ...base,
      auditoria:{versao:'evidencias-v1',casos:[...catalogos].map(([referencia,achados])=>({referencia,selecaoModeloValidada:selecoesValidadas.has(referencia),achados:achados.map(({id,tipo,evidencias})=>({id,tipo,evidencias}))}))},
      [respostaParaModelo]:`Diagnóstico de ${casos.length} registros do grupo de erros em ${grupo.competencia}; detalhes individuais disponíveis somente no Vale.`,
      texto: conversa,
      fonte:
        base.fonte +
        (codigo.fontes.length
          ? ' · ' + codigo.fontes.join(' · ')
          : ' · código indisponível'),
      detalhes:
        (sinteseFalhou?'A síntese do provedor está indisponível; mantive as evidências verificáveis.\n':'')+
        'Grupo preservado da consulta de ' +
        grupo.capturadoEm +
        '. Situações foram consultadas novamente e podem ter mudado desde o panorama. Diagnóstico limitado a 20 registros por resposta. Nomes e matrículas não foram enviados ao provedor. Código: pacote ' +
        codigo.estado.revisao +
        ', atualizado em ' +
        codigo.estado.atualizadoEm +
        '.\n' +
        casos
          .map(
            (c) =>
              c.referencia +
              ': ' +
              c.dados.texto +
              '\n' +
              (c.dados.detalhes ?? ''),
          )
          .join('\n\n'),
      tabela: {
        colunas: [
          'Matrícula',
          'Funcionário',
          'Filial',
          'Execução',
          'Estado atual',
          'Resultados com erro',
          'Resultados com valor calculado',
          'Evidência e orientação',
          'Competência',
          'Etapa indicada pelo estado',
          'Fórmulas e versões históricas',
          'Variáveis e memórias relacionadas',
          'Interpretação para o usuário',
        ],
        linhas: casos.map((c) => [
          c.pessoa.funcionario_id_rm,
          c.pessoa.nome_funcionario,
          c.pessoa.execucao.filial.nome,
          c.pessoa.execucao.execucao_id,
          c.pessoa.status,
          c.leituraFalhou
            ? null
            : (c.dados.tabela?.linhas.filter((r) => r[3] === 'Erro').length ??
              0),
          c.leituraFalhou
            ? null
            : (c.dados.tabela?.linhas.filter((r) => r[4] !== null).length ?? 0),
          c.leituraFalhou
            ? c.dados.texto
            : evidenciaDoCaso(c.dados) +
              ' Interpretação validada por evidências: ' +
              (explicacoes.get(c.referencia) ??
                c.dados.texto +
                  ' Causa atual não confirmada. Confira as evidências históricas nos detalhes.'),
          grupo.competencia,
          etapaDoEstado(c.pessoa.status),
          contextoDoDiagnostico(c.dados).formulas,
          contextoDoDiagnostico(c.dados).variaveis,
          interpretarParaUsuario(c.dados[fatosInternos],catalogos.get(c.referencia)??[]),
        ]),
        parcial,
      },
      links,
    };
  }

  async responder(
    identificador: string | undefined,
    escopo: { periodoId: number; competencia: string; filialId?: number },
    provedor: 'claude' | 'gpt-institucional',
    credencial: { modelo: string; chave: string },
    contexto?: string | null,
  ): Promise<ResultadoAssistente> {
    const base = {
      competencia: escopo.competencia,
      consultadoEm: new Date().toISOString(),
      fonte: 'Banco do Vale · investigação de funcionário',
    };
    const termo = identificador?.trim();
    if (!termo)
      return {
        ...base,
        texto:
          'Qual funcionário deseja investigar? Informe o nome ou a matrícula. A competência será a ativa.',
      };
    const where = {
      execucao: {
        periodo_id: escopo.periodoId,
        ...(escopo.filialId ? { filial_id: escopo.filialId } : {}),
      },
      OR: [
        { funcionario_id_rm: termo },
        { nome_funcionario: { contains: termo } },
      ],
    };
    const candidatos = await this.prisma.execucao_funcionario_base.findMany({
      where,
      take: 6,
      select: {
        execucao_funcionario_base_id: true,
        funcionario_id_rm: true,
        nome_funcionario: true,
        status: true,
        execucao: {
          select: {
            execucao_id: true,
            filial_id: true,
            filial: { select: { nome: true } },
          },
        },
      },
    });
    if (!candidatos.length)
      return {
        ...base,
        texto:
          'Nenhum funcionário corresponde à identificação no recorte consultado. Confira a identificação e a filial da tela; isso não confirma falha na importação.',
        filial: escopo.filialId ? 'Filial do contexto' : 'Todas as filiais',
      };
    if (candidatos.length !== 1)
      return {
        ...base,
        texto:
          'Há mais de um registro correspondente. Informe a matrícula e a filial; não escolhi uma execução silenciosamente.',
        tabela: {
          colunas: ['Matrícula', 'Funcionário', 'Filial', 'Execução'],
          linhas: candidatos.map((c) => [
            c.funcionario_id_rm,
            c.nome_funcionario,
            c.execucao.filial.nome,
            c.execucao.execucao_id,
          ]),
          parcial: candidatos.length === 6,
        },
      };
    const pessoa = candidatos[0];
    const execucao = pessoa.execucao;
    const runs = await this.prisma.execucao.findMany({
      where: { historica_de_execucao_id:null, periodo_id: escopo.periodoId, filial_id: execucao.filial_id },
      select: { execucao_id: true },
      take: 3,
    });
    const meta = {
      ...base,
      matricula: pessoa.funcionario_id_rm,
      filial: execucao.filial.nome,
      links: [
        {
          texto: 'Abrir execução',
          url: '/processamento/' + execucao.execucao_id,
        },
      ],
    };
    if (runs.length !== 1)
      return {
        ...meta,
        texto:
          'Existem execuções duplicadas nesta filial e competência. Resolva a duplicidade antes de atribuir uma causa ao funcionário; nenhuma execução foi escolhida para diagnóstico.',
      };
    return this.analisar(pessoa, escopo, meta, provedor, credencial, contexto);
  }

  private async analisar(
    pessoa: PessoaInvestigacao,
    escopo: { periodoId: number; competencia: string; filialId?: number },
    meta: Omit<ResultadoAssistente, 'texto'>,
    provedor: 'claude' | 'gpt-institucional',
    credencial: { modelo: string; chave: string },
    contexto?: string | null,
    sintetizar = true,
  ): Promise<ResultadoFatos> {
    const execucao = pessoa.execucao;
    const [resultados, logs, filas, formulasAtivas, filasIndividuais] = await Promise.all([
      this.prisma.execucao_funcionario.findMany({
        where: {
          execucao_id: execucao.execucao_id,
          execucao_funcionario_base_id: pessoa.execucao_funcionario_base_id,
        },
        take: 101,
        orderBy: { formula_id: 'asc' },
        select: {
          formula_id: true,
          status: true,
          valor_calculado: true,
          valor_final: true,
          ajuste_manual: true,
          formula_snapshot: true,
          formula: { select: { nome: true, versao: true } },
          _count: { select: { memoria_calculo: true } },
          memoria_calculo: {
            select: { variavel_codigo: true, variavel_nome: true },
            take: 200,
            distinct: ['variavel_codigo'],
          },
        },
      }),
      this.prisma.log_execucao.findMany({
        where: {
          execucao_id: execucao.execucao_id,
          nivel: 'ERROR',
          mensagem: { contains: pessoa.funcionario_id_rm },
        },
        select: { mensagem: true, data_log: true },
        orderBy: { log_id: 'desc' },
        take: 101,
      }),
      this.prisma.execucao_queue.groupBy({
        by: ['status'],
        where: { execucao_id: execucao.execucao_id },
        _count: true,
      }),
      this.prisma.formula.count({
        where: { filial_id: execucao.filial_id, ativa: true },
      }),
      this.prisma.execucao_queue.findMany({where:{execucao_id:execucao.execucao_id,execucao_funcionario_base_id:pessoa.execucao_funcionario_base_id},orderBy:{queue_id:'desc'},take:101,select:{tipo:true,status:true,last_error:true,updated_at:true}}),
    ]);
    const evidencias = resultados.slice(0, 100).map((r) => {
      const snapshot = lerSnapshotFormula(r.formula_snapshot);
      const gravados = r.memoria_calculo.map((m) => m.variavel_codigo);
      const necessarios = snapshot
        ? [...analisarExpressao(snapshot.expressao).codigos]
        : null;
      return {
        formulaId: r.formula_id,
        formula: snapshot?.nome ?? r.formula.nome,
        versaoHistorica: snapshot?.versao ?? null,
        versaoCadastro: r.formula.versao,
        status: r.status,
        situacao: situacaoValor(
          r.status,
          r.valor_calculado?.toString() ?? null,
        ),
        calculado: r.valor_calculado?.toString() ?? null,
        finalLocal: r.valor_final?.toString() ?? null,
        ajusteManual: r.ajuste_manual,
        memoriasGravadas: r._count.memoria_calculo,
        variaveisComMemoria: gravados,
        variaveisIdentificadas: r.memoria_calculo.map(m=>({codigo:m.variavel_codigo,nome:m.variavel_nome??null})),
        variaveisHistoricasSemMemoria:
          r.memoria_calculo.length >= 200
            ? null
            : (necessarios?.filter((c) => !gravados.includes(c)) ?? null),
      };
    });
    const historico = logs.slice(0, 100).flatMap((l) => {
      const seguro = resumirLogInvestigacao(
        l.mensagem,
        pessoa.funcionario_id_rm,
      );
      return seguro ? [{ ...seguro, data: l.data_log.toISOString() }] : [];
    });
    const codigo = this.conhecimento.investigacao();
    const fatos = {
      competencia: escopo.competencia,
      statusFuncionario: pessoa.status,
      filasDaExecucaoInteiraIncluindoHistorico: filas.map((f) => ({
        status: f.status,
        quantidade: f._count,
      })),
      formulasAtivasNoCadastroAtual: formulasAtivas,
      resultados: evidencias,
      logsHistoricos: historico,
      filasIndividuais:filasIndividuais.slice(0,100).filter((f,i,all)=>all.findIndex(x=>x.tipo===f.tipo)===i).map(f=>({tipo:f.tipo,status:f.status,categoria:classificarFalhaIndividual(f.last_error,f.tipo),recusaDuplicidadeHistorica:temRecusaDuplicidadeHistorica(f.last_error,f.tipo),data:f.updated_at?.toISOString()??null})),
      limites: {
        resultadosParciais: resultados.length > 100,
        logsParciais: logs.length > 100,
        filasIndividuaisParciais:filasIndividuais.length>100,
        logsNaoInterpretados: logs.slice(0, 100).length - historico.length,
      },
    };
    const resumo = `Estado do funcionário: ${pessoa.status ?? 'não informado'}. ${evidencias.filter((r) => r.calculado !== null).length} de ${evidencias.length} resultado(s) consultado(s) têm valor calculado; ${evidencias.filter((r) => r.status === 'ERRO').length} estão em erro. ${evidencias.reduce((n, r) => n + r.memoriasGravadas, 0)} memória(s) gravada(s) por resultado/fórmula.`;
    const catalogo=criarAuditoria(fatos,codigo.trechos);
    let explicacao=formatarAuditoria(catalogo),selecaoModeloValidada=false;
    if(sintetizar)try{
      const texto=await consultarModelo(provedor,credencial,regrasFixas+'\n'+(contexto||promptSugerido)+'\nPriorize somente os IDs dos achados fornecidos. Não escreva texto livre nem novas causas. Retorne {"achados":["id"]}, no máximo 12 IDs.',JSON.stringify({achados:catalogo,codigo:codigo.trechos}),600,
        {nome:'vale_ia_achados',schema:{type:'object',properties:{achados:{type:'array',items:{type:'string',enum:catalogo.map(a=>a.id)},maxItems:12}},required:['achados'],additionalProperties:false}});
      const plano=JSON.parse(texto) as {achados?:unknown};if(!plano||Object.keys(plano).length!==1)throw new Error('Invalid selection');
      explicacao=formatarAuditoria(catalogo,validarSelecao(catalogo,plano.achados));selecaoModeloValidada=true;
    }catch{explicacao=formatarAuditoria(catalogo)+'\nA priorização pelo provedor está indisponível; a auditoria por evidências foi preservada.';}
    const detalhe=contextoDoDiagnostico({[fatosInternos]:fatos,texto:resumo});
    return {
      [respostaParaModelo]:`Investigação individual de ${escopo.competencia}. ${resumo} Detalhes pessoais disponíveis somente no Vale.`,
      [fatosInternos]: fatos,
      auditoria:{versao:'evidencias-v1',casos:[{referencia:'Caso 1',selecaoModeloValidada,achados:catalogo.map(({id,tipo,evidencias})=>({id,tipo,evidencias}))}]},
      ...meta,
      texto: `Competência ${escopo.competencia} · Filial ${meta.filial ?? execucao.filial.nome} · Funcionário ${pessoa.nome_funcionario ?? 'nome não informado'} (matrícula ${pessoa.funcionario_id_rm}).\n\n` + interpretarParaUsuario(fatos,catalogo),
      fonte:
        meta.fonte +
        (codigo.fontes.length
          ? ' · ' + codigo.fontes.join(' · ')
          : ' · código indisponível'),
      detalhes:
        explicacao + '\nFórmulas: '+detalhe.formulas+'\nVariáveis: '+detalhe.variaveis+'\n' +
        'As memórias foram contadas por resultado/fórmula; podem repetir variáveis. Os valores são registros existentes, sem recalcular benefícios. ' +
        'Logs reconhecidos: ' +
        JSON.stringify(historico) +
        '\n' +
        (codigo.trechos.length
          ? 'Código consultado do pacote ' +
            codigo.estado.revisao +
            ', atualizado em ' +
            codigo.estado.atualizadoEm +
            '.'
          : 'O pacote de código não contém as fontes necessárias.') +
        (logs.length > 100 ? '\nLogs limitados aos 100 mais recentes.' : ''),
      tabela: {
        colunas: [
          'Fórmula',
          'Versão histórica',
          'Versão cadastro',
          'Estado',
          'Calculado',
          'Final local',
          'Ajuste manual',
          'Memórias gravadas',
          'Variáveis históricas sem memória',
          'Competência',
          'Filial',
          'Funcionário',
          'Matrícula',
          'Execução',
          'Fórmula ID',
          'Variáveis com memória',
        ],
        linhas: evidencias.map((r) => [
          r.formula,
          r.versaoHistorica,
          r.versaoCadastro,
          r.situacao,
          r.calculado,
          r.finalLocal,
          r.ajusteManual ? 'Sim' : 'Não',
          r.memoriasGravadas,
          r.variaveisHistoricasSemMemoria?.join(', ') ?? null,
          escopo.competencia,
          meta.filial??execucao.filial.nome,
          pessoa.nome_funcionario,
          pessoa.funcionario_id_rm,
          execucao.execucao_id,
          r.formulaId,
          r.variaveisIdentificadas.map(v=>v.codigo+(v.nome?' — '+v.nome:'')).join(', '),
        ]),
        parcial: resultados.length > 100 || logs.length>100 || filasIndividuais.length>100,
      },
    };
  }
}
