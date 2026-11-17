type Opcoes = {
  periodos: { periodo_id: number; competencia: string; ativo: boolean }[];
  filiais: { filial_id: number; nome: string }[];
};

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function palavras(texto: string) {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function respostaTodasFiliais(texto: string) {
  return /^(?:todas(?: as filiais)?|todas elas|geral)[.!?\s]*$/.test(
    normalizar(texto).trim(),
  );
}

export function contextoDaPergunta(
  pergunta: string,
  opcoes: Opcoes | undefined,
  competenciaAtual: string,
  filialAtual: string,
): {
  periodoId?: number;
  filialId?: number;
  matricula?: string;
  aviso?: string;
  todasFiliais?: boolean;
} {
  const texto = normalizar(pergunta);
  const periodos = opcoes?.periodos.filter((periodo) => periodo.ativo) ?? [];
  const data = /\b(0?[1-9]|1[0-2])\/(\d{4})\b/.exec(texto);
  const competencia = data && `${data[1].padStart(2, "0")}/${data[2]}`;
  const periodo = competencia
    ? periodos.find((item) => item.competencia === competencia)
    : (periodos.find((item) => String(item.periodo_id) === competenciaAtual) ??
      periodos[0]);
  if (competencia && !periodo) {
    return {
      aviso: `A competência ${competencia} não está ativa. Posso consultar uma competência ativa do Vale.`,
    };
  }

  const frase = ` ${palavras(texto)} `;
  const filiais = opcoes?.filiais ?? [];
  const citadas = filiais
    .map((filial) => ({
      ...filial,
      termo: palavras(filial.nome).replace(/^filial /, ""),
    }))
    .filter(({ termo }) => termo.length > 1 && frase.includes(` ${termo} `));
  const correspondencias = citadas.filter(
    ({ termo }) =>
      !citadas.some(
        (outra) =>
          outra.termo !== termo && ` ${outra.termo} `.includes(` ${termo} `),
      ),
  );
  if (correspondencias.length > 1) {
    return {
      aviso:
        "Encontrei mais de uma filial na pergunta. Qual delas você quer consultar?",
    };
  }
  const todas =
    respostaTodasFiliais(pergunta) || /\btodas (?:as )?filiais\b/.test(texto);
  const filial = todas
    ? undefined
    : (correspondencias[0] ??
      filiais.find((item) => String(item.filial_id) === filialAtual));
  const matricula = /\bmatr[ií]cula\s*[:#]?\s*([A-Za-z0-9./-]{1,50})\b/i.exec(
    pergunta,
  )?.[1];
  return {
    periodoId: periodo?.periodo_id,
    ...(todas ? { todasFiliais: true } : {}),
    filialId: filial?.filial_id,
    matricula: matricula && /\d/.test(matricula) ? matricula : undefined,
  };
}
