export type FalhaColeta={codigo:string;consulta:string;categoria:'REGRA_AUSENTE'|'REGRA_DUPLICADA'|'CONJUNTO_DIVERGENTE'|'DADO_INVALIDO'|'FORA_CONTRATO';registradaEm:string;antesDoWorker:boolean;logIndividualCompativel:boolean};
const motivos:Record<string,FalhaColeta['categoria']>={
 'Regra não retornada pelo RM. Atualize os vínculos antes de processar.':'REGRA_AUSENTE',
 'Mais de um vínculo para a mesma regra. Atualize os vínculos antes de processar.':'REGRA_DUPLICADA',
 'O conjunto de regras retornado pelo RM difere da execução. Atualize os vínculos ou a sentença.':'CONJUNTO_DIVERGENTE',
 'Dado ausente ou inválido no RM.':'DADO_INVALIDO',
 'Chapa fora do contrato da sentença em lote.':'FORA_CONTRATO',
};
/** Só interpreta a última falha específica, diretamente ou imediatamente antes do aviso genérico. */
export function lerFalhaColeta(raw:string|null,logs:{mensagem:string}[],matricula:string):FalhaColeta|undefined{
 if(!raw)return;
 const blocos=raw.replace(/\\n/g,'\n').split(/(?=^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - \[[A-Z_]+\])/m).map(b=>b.trim()).filter(Boolean);
 const code=(s:string)=>/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} - \[([A-Z_]+)\]/.exec(s)?.[1];
 const ultimo=blocos.at(-1)??'',antesDoWorker=code(ultimo)==='ERRO_WORKER';
 const alvo=antesDoWorker?blocos.at(-2)??'':ultimo;
 if(code(alvo)!=='ERRO_VARIAVEIS')return;
 const m=/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - \[ERRO_VARIAVEIS\] ([\w.-]{1,50}) \(([\w.-]{1,100})\): ([^\r\n]+)$/.exec(alvo);
 if(!m||!Object.hasOwn(motivos,m[4]))return;
 if(antesDoWorker&&m[1]>(/^([\d -:]+) - \[/.exec(ultimo)?.[1]??''))return;
 const compativel=logs.some(l=>{const v=/^Erro RM variavel ([\w.-]{1,50}) \(([\w.-]{1,100})\) para funcionário ([^:\r\n]+): ([^\r\n]+)$/.exec(l.mensagem);return !!v&&v[1]===m[2]&&v[2]===m[3]&&v[3]===matricula&&v[4]===m[4]});
 return {codigo:m[2],consulta:m[3],categoria:motivos[m[4]],registradaEm:m[1],antesDoWorker,logIndividualCompativel:compativel};
}
export function orientacaoColeta(f:FalhaColeta):string{
 switch(f.categoria){
 case 'REGRA_AUSENTE':return 'A coleta parou porque a combinação deste funcionário com a regra de transporte esperada não apareceu no retorno consultado. Confira se o vínculo de transporte continua válido e corresponde ao vínculo registrado nesta execução. Se estiver correto, peça ao responsável para conferir se a consulta retorna o funcionário e a mesma regra. O registro não prova que o vínculo foi excluído do RM.';
 case 'REGRA_DUPLICADA':return 'A coleta encontrou mais de um retorno para a mesma combinação de funcionário e regra. Confira os vínculos de transporte e se a consulta está duplicando essa combinação antes de repetir.';
 case 'CONJUNTO_DIVERGENTE':return 'O conjunto de regras retornado não corresponde ao esperado na execução. Confira os vínculos usados e o formato da consulta com o responsável antes de repetir; ainda falta identificar a diferença exata.';
 case 'DADO_INVALIDO':return 'A coleta recebeu um dado ausente ou inválido para esta informação. Confira o retorno dessa consulta para este funcionário; o registro não permite afirmar se faltou uma linha, um campo ou um valor válido.';
 case 'FORA_CONTRATO':return 'A coleta não conseguiu associar este funcionário ao retorno em lote esperado. Confira a identificação usada na consulta e o retorno do lote antes de repetir.';
 }
}

export function formatarFalhaColeta(valor:unknown):string{
 if(!valor||typeof valor!=='object')return 'Ponto da coleta não identificado nos registros interpretados.';
 const f=valor as FalhaColeta;
 return `Variável: ${f.codigo}. Consulta RM: ${f.consulta}. Registro: ${f.registradaEm}. ${f.antesDoWorker?'Falha específica anterior ao aviso genérico.':'Último evento específico.'} ${f.logIndividualCompativel?'Há log individual compatível.':'Não foi encontrado log individual compatível nesta leitura.'}`;
}
