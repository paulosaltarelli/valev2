export function analisarExpressao(expressao: string) {
  const codigos = new Set<string>();
  let anterior = '';
  const tokens = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\r\n]*|:[A-Za-z0-9_]+|\s+|./g;
  const normalizada = expressao.replace(tokens, (token) => {
    if (/^\s|^#/.test(token)) return ' ';

    // Um parâmetro começa onde se espera um operando. Depois de um
    // operando, os dois-pontos separam os ramos de uma condicional.
    if (
      token.length > 1 &&
      token.startsWith(':') &&
      (anterior === '' || '([{,=+-*/%^!?<>:&|'.includes(anterior))
    ) {
      token = token.slice(1);
      codigos.add(token);
    }
    anterior = token.at(-1) ?? '';
    return token;
  });
  return { codigos, normalizada };
}
