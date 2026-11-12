export type ResultadoAuditavel = {
  formulaId:number; formula:string; versaoHistorica:number|null; status:string;
  calculado:string|null; memoriasGravadas:number;
  variaveisHistoricasSemMemoria:string[]|null;
};
export type CategoriaFila = 'HTTP_401'|'HTTP_403'|'HTTP_400'|'HTTP_429'|'TIMEOUT'|'SEM_CONFIRMACAO'|'REGRA_AUSENTE'|'REGRA_DUPLICADA'|'SESSAO_AUSENTE'|'NAO_CLASSIFICADO';
export type FilaAuditavel={tipo:string;status:string;categoria:CategoriaFila;data:string|null};
export type FatosAuditaveis={
  statusFuncionario?:string|null;resultados?:ResultadoAuditavel[];
  logsHistoricos?:{alvo?:string;codigo?:string;variavel?:string;evidencia:string;data:string}[];
  filasIndividuais?:FilaAuditavel[];
  limites?:{resultadosParciais?:boolean;logsParciais?:boolean;filasIndividuaisParciais?:boolean};
};
export type TrechoAuditavel={caminho:string;linha:number;trecho:string};
export type AchadoAuditavel={id:string;tipo:'fato'|'historico'|'hipotese'|'limitacao';texto:string;evidencias:string[];verificacao:string};

/** Classifica somente o último evento estruturado. Nunca retorna texto técnico bruto. */
export function classificarFalhaIndividual(raw:string|null,tipo:string):CategoriaFila{
  if(!raw)return 'NAO_CLASSIFICADO';
  const eventos=raw.replace(/\\n/g,'\n').split(/(?=^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - \[[A-Z_]+\])/m).map(s=>s.trim()).filter(Boolean);
  const ultimo=eventos.at(-1)??'';
  const codigo=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - \[([A-Z_]+)\]/.exec(ultimo)?.[1];
  const esperado=tipo==='ENVIAR_RM'?'ERRO_ENVIAR_RM':tipo==='VARIAVEIS'?'ERRO_VARIAVEIS':tipo==='VALORES'?'ERRO_VALORES':null;
  if(codigo==='SESSION_ID_AUSENTE')return 'SESSAO_AUSENTE';
  if(!esperado||codigo!==esperado)return 'NAO_CLASSIFICADO';
  if(/RM respondeu sem identificador do lan[cç]amento|Envio sem confirma[cç][aã]o/.test(ultimo))return 'SEM_CONFIRMACAO';
  const http=/(?:HTTP(?:\s+status)?|status(?:\s+code)?|statusCode)\s*[:=]?\s*(401|403|400|429)\b/i.exec(ultimo)?.[1];
  if(http)return ('HTTP_'+http) as CategoriaFila;
  if(/\bETIMEDOUT\b|\bECONNABORTED\b|timeout of \d+ms exceeded/i.test(ultimo))return 'TIMEOUT';
  if(ultimo.includes('Regra não retornada pelo RM. Atualize os vínculos antes de processar.'))return 'REGRA_AUSENTE';
  if(ultimo.includes('Mais de um vínculo para a mesma regra. Atualize os vínculos antes de processar.'))return 'REGRA_DUPLICADA';
  return 'NAO_CLASSIFICADO';
}

export function criarAuditoria(fatos:FatosAuditaveis|undefined,codigo:TrechoAuditavel[]):AchadoAuditavel[]{
  const achados:AchadoAuditavel[]=[];
  const add=(id:string,tipo:AchadoAuditavel['tipo'],texto:string,evidencias:string[],verificacao:string)=>achados.push({id,tipo,texto,evidencias,verificacao});
  if(!fatos){add('leitura_indisponivel','limitacao','Não foi possível ler as evidências individuais. Não há causa confirmada.',[],'Consultar novamente os registros deste funcionário na execução.');return achados;}
  const rs=fatos.resultados??[],logs=fatos.logsHistoricos??[];
  const fonteCalculo=codigo.find(c=>/execucao\.service\.ts$/.test(c.caminho)&&/Erro ao calcular fórmula|Sem memoria_calculo/.test(c.trecho));
  const fonteRm=codigo.find(c=>/execucao\.service\.ts$/.test(c.caminho)&&c.trecho.includes('ERRO_ENVIAR_RM'));
  const fonteVariaveis=codigo.find(c=>/execucao\.service\.ts$/.test(c.caminho)&&/ERRO_VARIAVEIS|Erro RM variavel/.test(c.trecho));
  const ref=(c:TrechoAuditavel)=>'codigo:'+c.caminho+':'+c.linha;
  const valores=rs.filter(r=>r.calculado!==null).length,erros=rs.filter(r=>r.status==='ERRO').length;
  add('estado_e_resultados','fato',`Estado registrado: ${fatos.statusFuncionario??'não identificado'}. ${valores} de ${rs.length} resultados lidos têm valor calculado; ${erros} estão em erro.`,['banco:estado_funcionario','banco:resultados'],'Conferir os resultados por fórmula e a revisão da execução.');
  if(valores>0)add('valores_existentes','fato','Há valores persistidos; o erro não comprova ausência total de cálculo nem autoriza tratar valores existentes como zero.',['banco:resultados'],'Distinguir os resultados calculados daqueles em erro ou sem cálculo.');
  if(rs.some(r=>r.calculado!==null&&/^[-+]?0(?:\.0+)?$/.test(r.calculado)))add('zero_persistido','fato','Há resultado gravado com valor zero; zero não equivale a ausência de cálculo.',['banco:resultados'],'Conferir o estado e a regra histórica do resultado com zero.');
  if(rs.some(r=>r.memoriasGravadas>0))add('memorias_existentes','fato','Existem memórias gravadas. Não é correto afirmar ausência total de memória. As memórias podem repetir variáveis entre fórmulas.',['banco:memorias_por_resultado'],'Conferir as variáveis e datas da memória de cada fórmula.');
  if(rs.some(r=>r.versaoHistorica===null))add('versao_ausente','limitacao','Parte dos resultados não tem fórmula histórica verificável. O cadastro atual não comprova qual regra foi utilizada.',['banco:formula_snapshot'],'Consultar os snapshots e o histórico de revisões; não substituir silenciosamente a regra histórica pelo cadastro atual.');
  const etapa=fatos.statusFuncionario==='ERRO_RM'?'ENVIAR_RM':fatos.statusFuncionario?.includes('VARIAVEIS')?'VARIAVEIS':fatos.statusFuncionario?.includes('RESULTADO')?'VALORES':null;
  let motivoIndividual=false;
  for(const [i,fila]of (fatos.filasIndividuais??[]).entries()){
    if(fila.status!=='ERRO'||fila.tipo!==etapa||fila.categoria==='NAO_CLASSIFICADO')continue;
    const fonte=fila.categoria==='SESSAO_AUSENTE'?codigo.find(c=>c.trecho.includes('SESSION_ID_AUSENTE')):fila.tipo==='ENVIAR_RM'?fonteRm:fila.tipo==='VARIAVEIS'?fonteVariaveis:fonteCalculo;
    const evidencias=['banco:fila_individual:'+i,...(fonte?[ref(fonte)]:[])];
    const descricao:Record<CategoriaFila,string>={HTTP_401:'resposta HTTP 401',HTTP_403:'resposta HTTP 403',HTTP_400:'resposta HTTP 400',HTTP_429:'resposta HTTP 429',TIMEOUT:'estouro do tempo de uma solicitação',SEM_CONFIRMACAO:'envio sem confirmação de identificador',REGRA_AUSENTE:'regra não retornada pelo RM',REGRA_DUPLICADA:'mais de um vínculo para a mesma regra',SESSAO_AUSENTE:'ausência de sessão na solicitação',NAO_CLASSIFICADO:'falha não classificada'};
    add('motivo_individual_'+i,'fato',`A última fila individual da etapa ${fila.tipo}, ainda em erro, registrou ${descricao[fila.categoria]}${fila.data?' (registro '+fila.data+')':''}. Isso descreve a tentativa registrada, não a situação atual do ambiente.`,evidencias,'Consultar o histórico individual e a revisão da tentativa.');
    motivoIndividual=true;
    if(fonte){
      const verificacao=fila.categoria==='SEM_CONFIRMACAO'||fila.categoria==='TIMEOUT'?'Conferir a resposta e os registros de envio antes de uma nova tentativa. A falha não comprova que nenhum lançamento foi gravado; este diagnóstico não realiza conciliação com o RM.':fila.categoria==='HTTP_401'||fila.categoria==='HTTP_403'||fila.categoria==='SESSAO_AUSENTE'?'Conferir a sessão e a autorização usadas no horário dessa tentativa, além da resposta do RM. O registro não comprova que a credencial esteja inválida hoje.':fila.categoria==='REGRA_AUSENTE'||fila.categoria==='REGRA_DUPLICADA'?'Conferir os vínculos e as regras que compunham a execução e a resposta registrada, antes de alterar cadastros.':'Conferir a resposta individual dessa tentativa e o contrato da etapa; não atribuir a falha a cadastro ou payload sem detalhe específico.';
      const interpretacoes:Record<CategoriaFila,string>={
        HTTP_401:'A tentativa pode ter sido recusada na autenticação. O indício é a resposta 401; não comprova credencial inválida atualmente.',
        HTTP_403:'Uma regra de acesso pode ter recusado a solicitação. O código 403 não identifica qual regra foi aplicada.',
        HTTP_400:'Uma validação pode ter recusado a solicitação. O código 400 isolado não identifica o campo nem comprova erro de mapeamento.',
        HTTP_429:'Uma limitação de requisições pode ter bloqueado a tentativa, conforme o código 429 registrado.',
        TIMEOUT:'A ausência de resposta dentro do tempo limite pode ter interrompido a etapa; não comprova indisponibilidade atual nem ausência de gravação no RM.',
        SEM_CONFIRMACAO:'O retorno sem identificador pode ter impedido a confirmação local do envio; não comprova que o RM deixou de gravar.',
        REGRA_AUSENTE:'O conjunto de vínculos retornado pode não corresponder ao esperado pela execução, conforme a falha de regra ausente registrada.',
        REGRA_DUPLICADA:'Mais de um vínculo para a mesma regra pode ter impedido a identificação de um resultado único, conforme o registro individual.',
        SESSAO_AUSENTE:'A falta de sessão na solicitação pode ter impedido a etapa, conforme o evento individual registrado.',
        NAO_CLASSIFICADO:'O motivo não foi identificado.',
      };
      add('hipotese_individual_'+i,'hipotese',interpretacoes[fila.categoria]+' Não atribuir essa falha a outras fórmulas, variáveis ou pessoas.',evidencias,verificacao);
    }
  }
  for(const [i,log]of logs.slice(0,10).entries()){
    add('log_historico_'+i,'historico',log.evidencia+' Registro histórico: '+log.data+'. Não comprova, sozinho, a causa atual.',['banco:log_reconhecido:'+i],'Correlacionar o log à fórmula, revisão e tentativa afetadas.');
    const r=rs.find(r=>String(r.formulaId)===log.codigo&&r.status==='ERRO');
    if(fonteCalculo&&log.alvo==='Fórmula'&&log.variavel&&r?.versaoHistorica!==null&&r?.variaveisHistoricasSemMemoria?.includes(log.variavel))
      add('hipotese_simbolo_'+i,'hipotese',`A dependência ${log.variavel}, citada no log da fórmula #${r.formulaId}, também está sem memória na leitura da regra histórica. Isso é compatível com a falha, mas não confirma a origem da ausência nem uma falha no RM.`,['banco:resultado:'+r.formulaId,'banco:log_reconhecido:'+i,ref(fonteCalculo)],'Conferir a memória dessa variável, sua coleta e a revisão/data da tentativa antes de confirmar a causa.');
  }
  if(!motivoIndividual)add('causa_nao_confirmada','limitacao','Não foi identificado motivo individual específico que sustente uma causa atual. Status, filas da execução inteira e logs antigos não bastam para atribuir causa a esta pessoa.',['banco:estado_funcionario'],'Consultar a última falha individual e os registros da tentativa. Não presumir causas que os registros não demonstrem.');
  if(!codigo.length)add('codigo_ausente','limitacao','O código necessário ao confronto não está disponível; nenhuma hipótese de implementação foi confirmada.',['banco:estado_funcionario'],'Disponibilizar a versão do código correspondente à execução.');
  else add('versao_do_aplicativo','limitacao','O código consultado pertence ao pacote disponibilizado pelo servidor. Não comprova, por si só, qual versão do aplicativo executou uma tentativa passada.',codigo.slice(0,1).map(ref),'Correlacionar a tentativa à versão publicada antes de confirmar uma causa de implementação.');
  if(Object.values(fatos.limites??{}).some(v=>v===true))add('leitura_parcial','limitacao','A leitura possui limites; a investigação não representa todos os registros históricos.',['banco:limites_de_leitura'],'Conferir os registros que ficaram fora do limite antes de uma conclusão completa.');
  return achados;
}

/** O modelo seleciona referências; nenhum texto causal livre dele é exibido. */
export function validarSelecao(catalogo:AchadoAuditavel[],selecao:unknown):string[]{
  if(!Array.isArray(selecao)||selecao.length>12||selecao.some(id=>typeof id!=='string'||!catalogo.some(a=>a.id===id))||new Set(selecao).size!==selecao.length)throw new Error('Referências de evidência inválidas');
  return selecao;
}
export function formatarAuditoria(catalogo:AchadoAuditavel[],selecao:string[]=[]):string{
  const ordem=[...selecao,...catalogo.map(a=>a.id)].filter((id,i,ids)=>ids.indexOf(id)===i);
  const nomes:Record<string,string>={'banco:estado_funcionario':'estado do funcionário','banco:resultados':'resultados persistidos','banco:memorias_por_resultado':'memórias por fórmula','banco:formula_snapshot':'fórmula histórica','banco:limites_de_leitura':'limites da consulta'};
  const fonte=(id:string)=>nomes[id]??id.replace(/^codigo:/,'código ').replace(/^banco:resultado:/,'resultado da fórmula #').replace(/^banco:fila_individual:(\d+)$/,(_,n)=>'fila individual '+(Number(n)+1)).replace(/^banco:log_reconhecido:(\d+)$/,(_,n)=>'log histórico '+(Number(n)+1));
  return ordem.map(id=>catalogo.find(a=>a.id===id)!).filter(Boolean).map(a=>`${a.tipo==='hipotese'?'Hipótese apoiada, não confirmada':a.tipo==='historico'?'Evidência histórica':a.tipo==='limitacao'?'Limitação':'Evidência'}: ${a.texto}${a.evidencias.length?' Fontes: '+a.evidencias.map(fonte).join(', ')+'.':''} Verificação: ${a.verificacao}`).join('\n');
}
