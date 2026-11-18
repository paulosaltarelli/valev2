export function contextHelp(path: string): string {
 if(path.includes('/filial/variaveis/'))return '/ajuda/nova-variavel';
 if(path.includes('/filial/formulas/'))return '/ajuda/nova-formula';
 if(path.startsWith('/processamento/'))return '/ajuda/processar-variaveis';
 const guide:Record<string,string>={dashboard:'primeiros-passos',processamento:'nova-execucao',filial:'filiais',periodo:'competencias','gestao-km':'gestao-km',relatorios:'relatorios','extrato-processamento':'relatorios','variacao-competencias':'relatorios','falhas-por-causa':'pendencias',usuarios:'menus-e-acesso','configuracao-ia':'suporte-e-seguranca'};
 return guide[path.split('/')[1]]?`/ajuda/${guide[path.split('/')[1]]}`:'/ajuda';
}
