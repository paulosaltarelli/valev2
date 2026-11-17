import { formulaFingerprints } from './formulaFingerprints';

export type Pattern = 'futureDays'|'futureValue'|'discountDays'|'discountValue'|'refundDays'|'refundValue'|'refundStrict';
export type Scope = Record<string,number>;
export type Example = { title:string; scope:Scope };
export const examples:Example[]=[
 {title:'Viagem · sem teto',scope:{REGRA_PGTO:1,NRO_VIAGENS:2,VR_V:10,VR_FIXO:350,Km_Func:20,DIAS_A_TRABALH_FUT:22,D_RECEB_PASS:20,D_TRAB_REAL:23,DESC_AFAST:1,AFASTAMENTOS:1,ATESTADO:1,DESC_FALT_IN:1,FALTA_INJUST:1,DESC_FALT_JU:0,FALTA_JUSTIF:2,TETO_PAGAMENTO:0,FERIAS:0}},
];
const base=examples[0].scope;
examples.push(
 {title:'Fixo · sem teto',scope:{...base,REGRA_PGTO:2}},
 {title:'KM · sem teto',scope:{...base,REGRA_PGTO:3,VR_V:0.66}},
 {title:'Viagem · teto de R$ 25',scope:{...base,TETO_PAGAMENTO:25}},
 {title:'Fixo · zero dias recebidos, com ajuste',scope:{...base,REGRA_PGTO:2,D_RECEB_PASS:0,D_TRAB_REAL:3}},
 {title:'Fixo · zero dias recebidos, sem ajuste',scope:{...base,REGRA_PGTO:2,D_RECEB_PASS:0,D_TRAB_REAL:0,DESC_AFAST:0,DESC_FALT_IN:0,DESC_FALT_JU:0}},
 {title:'Dias trabalhados menores que os recebidos',scope:{...base,D_TRAB_REAL:18}},
 {title:'Descontos desabilitados',scope:{...base,DESC_AFAST:0,DESC_FALT_IN:0,DESC_FALT_JU:0}},
 {title:'Férias informadas, demais entradas iguais',scope:{...base,FERIAS:10}},
);

export function expressionVariables(expression:string):string[]{
 const codes=new Set<string>();let previous='';
 expression.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\r\n]*|:[A-Za-z0-9_]+|\s+|./g,token=>{
  if(/^\s|^#/.test(token))return ' ';
  if(token.length>1&&token.startsWith(':')&&(previous===''||'([{,=+-*/%^!?<>:&|'.includes(previous))){token=token.slice(1);codes.add(token);}
  previous=token.at(-1)??'';return token;
 });return [...codes];
}
export async function recognizeExpression(expression:string):Promise<Pattern|null>{
 const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expression.replace(/\s/g,'')));
 const key=Array.from(new Uint8Array(raw),value=>value.toString(16).padStart(2,'0')).join('');
 return (formulaFingerprints[key] as Pattern|undefined)??null;
}
export const number=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:4});
export function calculateExample(pattern:Pattern,v:Scope):{value:number|null;steps:string[]}{
 const discount=(v.DESC_AFAST===1?v.AFASTAMENTOS+v.ATESTADO:0)+(v.DESC_FALT_IN===1?v.FALTA_INJUST:0)+(v.DESC_FALT_JU===1?v.FALTA_JUSTIF:0);
 const refund=Math.max(0,v.D_TRAB_REAL-v.D_RECEB_PASS);
 const steps:string[]=[];
 if(pattern==='futureDays')return {value:v.DIAS_A_TRABALH_FUT,steps:[`Dias futuros = ${number(v.DIAS_A_TRABALH_FUT)}.`]};
 if(pattern==='refundDays')return {value:refund,steps:[`${number(v.D_TRAB_REAL)} trabalhados − ${number(v.D_RECEB_PASS)} recebidos = ${number(v.D_TRAB_REAL-v.D_RECEB_PASS)}.`,`Resultado negativo vira zero: ${number(refund)} dias.`]};
 const discountStep=`Dias descontáveis = ${v.DESC_AFAST===1?`${number(v.AFASTAMENTOS)} + ${number(v.ATESTADO)}`:'0 (afastamento/atestado desabilitado)'} + ${v.DESC_FALT_IN===1?number(v.FALTA_INJUST):'0 (falta injustificada desabilitada)'} + ${v.DESC_FALT_JU===1?number(v.FALTA_JUSTIF):'0 (falta justificada desabilitada)'} = ${number(discount)}.`;
 if(pattern==='discountDays')return {value:discount,steps:[discountStep]};
 let total:number;
 if(pattern==='futureValue'){
  if(v.REGRA_PGTO===2){total=v.VR_FIXO;steps.push(`Pagamento fixo: total = ${number(v.VR_FIXO)}. Não divide nem multiplica pelos dias futuros.`);}
  else if(v.REGRA_PGTO===1){total=v.NRO_VIAGENS*v.VR_V*v.DIAS_A_TRABALH_FUT;steps.push(`${number(v.NRO_VIAGENS)} viagens × ${number(v.VR_V)} × ${number(v.DIAS_A_TRABALH_FUT)} dias = ${number(total)}.`);}
  else if(v.REGRA_PGTO===3){total=v.Km_Func*v.VR_V*v.DIAS_A_TRABALH_FUT;steps.push(`${number(v.Km_Func)} KM × ${number(v.VR_V)} × ${number(v.DIAS_A_TRABALH_FUT)} dias = ${number(total)}.`);}
  else{total=0;steps.push('REGRA_PGTO não é 1, 2 ou 3: retorna zero.');}
 }else{
  const days=pattern==='discountValue'?discount:refund;
  steps.push(pattern==='discountValue'?discountStep:pattern==='refundStrict'?`Diferença dos dias = ${number(v.D_TRAB_REAL)} − ${number(v.D_RECEB_PASS)} = ${number(v.D_TRAB_REAL-v.D_RECEB_PASS)}.`:`Dias de reembolso: máximo entre 0 e (${number(v.D_TRAB_REAL)} − ${number(v.D_RECEB_PASS)}) = ${number(refund)}.`);
  if(pattern!=='refundStrict'&&days===0)return {value:0,steps:[...steps,'A expressão retorna zero antes de calcular a diária, pois não há dias de ajuste.']};
  if(v.REGRA_PGTO===2&&v.D_RECEB_PASS===0)return {value:null,steps:[...steps,'A expressão bloqueia a diária fixa: o divisor D_RECEB_PASS é zero. Permanece pendente para revisão; não é um resultado financeiro zero.']};
  let daily=0;
  if(v.REGRA_PGTO===1){daily=v.NRO_VIAGENS*v.VR_V;steps.push(`Diária de viagem = ${number(v.NRO_VIAGENS)} × ${number(v.VR_V)} = ${number(daily)}.`);}
  else if(v.REGRA_PGTO===2){daily=v.VR_FIXO/v.D_RECEB_PASS;steps.push(`Diária fixa do passado = ${number(v.VR_FIXO)} ÷ ${number(v.D_RECEB_PASS)} = ${number(daily)}.`);}
  else if(v.REGRA_PGTO===3){daily=v.Km_Func*v.VR_V;steps.push(`Diária de KM = ${number(v.Km_Func)} × ${number(v.VR_V)} = ${number(daily)}.`);}
  total=(pattern==='discountValue'?discount:v.D_TRAB_REAL-v.D_RECEB_PASS)*daily;
  steps.push(`Total antes do teto = ${number(pattern==='discountValue'?discount:v.D_TRAB_REAL-v.D_RECEB_PASS)} × ${number(daily)} = ${number(total)}.`);
 }
 if(v.TETO_PAGAMENTO>0){total=Math.min(total,v.TETO_PAGAMENTO);steps.push(`Limite do total: menor valor entre o total e ${number(v.TETO_PAGAMENTO)} = ${number(total)}.`);}
 else steps.push('TETO_PAGAMENTO = 0: a expressão não aplica limite.');
 if(pattern==='refundValue'||pattern==='refundStrict'){total=Math.max(0,total);steps.push(`Proteção do reembolso: resultado final não negativo = ${number(total)}.`);}
 return {value:total,steps};
}

export const patternGuide:Record<Pattern,{description:string;notes:string[]}>={
 futureDays:{description:'Retorna exatamente DIAS_A_TRABALH_FUT, sem outra operação.',notes:['O nome pode ser Dias Futuro ou Dias Suplementar. O número é obtido da memória da variável, não recalculado a partir do calendário nesta expressão.']},
 futureValue:{description:'Usa o total fixo quando REGRA_PGTO = 2. Na regra 1, multiplica viagens, tarifa e dias futuros. Na regra 3, multiplica KM, tarifa e dias futuros. Aplica o teto positivo ao total.',notes:['No fixo, VR_FIXO é total: não se divide por dias e não se multiplica por dias futuros.','Se REGRA_PGTO não for 1, 2 ou 3, a expressão retorna zero.','Esta mesma expressão também pode estar cadastrada como Valor Suplementar; o nome e o evento da filial definem a finalidade.']},
 discountDays:{description:'Soma apenas as ocorrências cujo controle de desconto é igual a 1. DESC_AFAST habilita conjuntamente AFASTAMENTOS + ATESTADO; os outros controles habilitam as faltas correspondentes.',notes:['Controle diferente de 1 não participa da soma. Não são descontadas automaticamente todas as ocorrências.']},
 discountValue:{description:'Calcula os dias descontáveis dentro da própria expressão. Se a soma é zero, retorna zero. Caso contrário calcula a diária da modalidade e limita o total pelo teto positivo.',notes:['Viagem: NRO_VIAGENS × VR_V. Fixo: VR_FIXO ÷ D_RECEB_PASS. KM: Km_Func × VR_V.','Fixo com D_RECEB_PASS = 0 e dias a descontar mantém pendência.','A expressão não chama Dias Descontar passado; repete internamente o critério de dias.']},
 refundDays:{description:'Calcula D_TRAB_REAL − D_RECEB_PASS e retorna zero se a diferença for negativa.',notes:['Não confunda dias de reembolso com valor em reais. A diária pertence à fórmula financeira.']},
 refundValue:{description:'Se a diferença não negativa dos dias é zero, retorna zero antes de calcular a diária. Se há dias de reembolso, calcula a diária da modalidade, limita o total e impede resultado final negativo.',notes:['Diária por viagem: NRO_VIAGENS × VR_V; fixa: VR_FIXO ÷ D_RECEB_PASS; KM: Km_Func × VR_V.','Fixo com zero dias recebidos fica em revisão quando há ajuste a calcular.','Não chama outra fórmula. A expressão incorpora o critério dos dias e a diária.']},
 refundStrict:{description:'Calcula a diária e o ajuste, aplica o teto e protege o resultado final contra negativo. Esta versão não tem retorno antecipado para zero dias de reembolso.',notes:['Diferença importante do cadastro atual: no fixo, D_RECEB_PASS = 0 bloqueia o cálculo mesmo quando a diferença dos dias é zero.','Esta é uma descrição da fórmula existente, não uma alteração ou recomendação automática de regra.']},
};
export const variableGuide:Record<string,string>={
 DIAS_A_TRABALH_FUT:'Quantidade de dias futuros retornada pela origem. A fórmula não refaz o calendário.',D_RECEB_PASS:'Dias já recebidos no passado. É o divisor da diária fixa dos ajustes do passado.',D_TRAB_REAL:'Dias trabalhados reais do passado. Comparado com os dias recebidos para determinar reembolso.',REGRA_PGTO:'Modalidade de pagamento: 1 viagem, 2 fixo, 3 KM. Não é o código da regra de transporte.',VR_FIXO:'Valor total fixo. No passado, a diária usa este total dividido pelos dias recebidos.',VR_V:'Tarifa da regra: multiplicada por viagens ou KM, conforme a modalidade.',Km_Func:'KM registrado para a pessoa e regra. O critério de trajeto depende da consulta RM.',NRO_VIAGENS:'Quantidade de viagens usada pela modalidade 1.',TETO_PAGAMENTO:'Teto financeiro quando maior que zero. Estas expressões limitam o total, não apenas a diária.',DESC_AFAST:'Controle que, quando igual a 1, inclui AFASTAMENTOS e ATESTADO nos dias de desconto.',AFASTAMENTOS:'Ocorrências de afastamento retornadas pela consulta para o período.',ATESTADO:'Ocorrências de atestado; incluídas no desconto quando DESC_AFAST = 1.',DESC_FALT_IN:'Quando igual a 1, inclui FALTA_INJUST no desconto.',FALTA_INJUST:'Faltas injustificadas retornadas para o período.',DESC_FALT_JU:'Quando igual a 1, inclui FALTA_JUSTIF no desconto.',FALTA_JUSTIF:'Faltas justificadas retornadas para o período.',FERIAS:'Férias do período. Só participa diretamente quando o código é referenciado pela expressão; também é preciso conferir a SQL das demais entradas.',TIPO_TRANSP:'Tipo de transporte da regra no RM; não é sinônimo de REGRA_PGTO.',EVENTOPAG:'Código do evento de pagamento.',EVENTODES:'Código do evento de desconto.',EVENTOREE:'Código do evento de reembolso.',EVENTOSUP:'Código do evento suplementar.',
};
