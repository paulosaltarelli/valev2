export function intencaoGrupoErros(pergunta:string,temContexto:boolean):'lista'|'prioridade'|'causas'|undefined {
 const q=pergunta.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
 if(/\b\d{1,2}\/\d{4}\b|\b(?:outra|nova) (?:filial|competencia)\b|\b(?:competencia|mes|periodo) (?:anterior|seguinte|passad[oa]|proxim[oa])\b/.test(q))return;
 if(/\b(?:na|da|para a) filial\b|\bmatricula\b/.test(q))return;
 if(temContexto&&/^(?:e )?(?:agora|o que (?:eu )?(?:faco|devo (?:fazer|verificar)(?: primeiro)?|verificar primeiro)|por onde (?:comeco|comecar)|como (?:eu )?(?:resolvo|resolver)|qual (?:o )?proximo passo)[\s?!.]*$/.test(q))return 'prioridade';
 if(temContexto&&/^(?:e )?(?:por que|porque|pq)(?: (?:deu|deram|aconteceu|isso))?[\s?!.]*$/.test(q))return 'causas';
 const falha=/\b(?:erro|erros|falha|falhas|problema|problemas)\b/.test(q);
 const coletivo=/\b(?:funcionarios|colaboradores|pessoas)\b/.test(q);
 const generico=/^(?:tem|ha|existe|existem)\s+(?:(?:algum|alguns|uma|um)\s+)?(?:funcionario|colaborador)/.test(q);
 const local=/^(?:onde|em quais filiais|quais filiais)\b/.test(q);
 const referencia=temContexto&&/\b(?:eles|elas|esses|essas|estes|estas)\b/.test(q)&&/\b(?:quais|quem|liste|mostre|erro|erros|falha|falhas)\b|por que|porque/.test(q);
 if(referencia||(falha&&(coletivo||generico||local)))return 'lista';
}
