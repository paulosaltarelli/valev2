import { Prisma } from '@prisma/client';

export type ReportFormula = {
  formula_id: number; nome: string; versao: number; tipo: string | null;
  expressao: string; codEvento: string | null; polaridade: string | null;
};
export type ReportResult = {
  formula: ReportFormula; formula_snapshot: string | null;
  status: string; valor_calculado: { toString(): string } | null;
  revisao: number; enviado_revisao: number | null;
  _count: { memoria_calculo: number };
};
export type ReportPerson = {
  funcionario_id_rm: string; codcoligada: number; nome_funcionario: string | null;
  status: string | null; execucao_funcionario: ReportResult[];
};
export const hasCalculatedValue = (r: ReportResult) =>
  ['PROCESSADO', 'ENVIADO_RM'].includes(r.status) && r.valor_calculado !== null;

export function closingCounts(people: ReportPerson[]) {
  const counts = { total: people.length, completos: 0, parciais: 0, semCalculo: 0,
    comErro: 0, aguardandoEnvio: 0, enviados: 0 };
  for (const person of people) {
    const results = person.execucao_funcionario;
    const complete = ['RESULTADOS_PROCESSADOS','ENVIADO_RM','ERRO_RM'].includes(person.status ?? '') &&
      results.length > 0 && results.every(hasCalculatedValue);
    const sent = complete && results.every(r => r.status === 'ENVIADO_RM' && r.enviado_revisao === r.revisao);
    if (complete) counts.completos++;
    else if (results.some(r => hasCalculatedValue(r) || r._count.memoria_calculo > 0)) counts.parciais++;
    else counts.semCalculo++;
    if ((person.status ?? '').startsWith('ERRO') || person.status === 'RESULTADOS_PARCIAL' || results.some(r=>r.status==='ERRO')) counts.comErro++;
    if (sent) counts.enviados++;
    else if (complete) counts.aguardandoEnvio++;
  }
  return counts;
}

export function lerSnapshotFormula(snapshot: string | null): ReportFormula | null {
  try {
    const value = JSON.parse(snapshot ?? 'null') as (ReportFormula & { snapshot_origem?: string }) | null;
    if (value && value.snapshot_origem !== 'CONFERENCIA_LEGADO' && typeof value.nome === 'string' && typeof value.expressao === 'string' && typeof value.versao === 'number') {
      return value;
    }
  } catch { /* Invalid legacy snapshots are explicitly non-comparable. */ }
  return null;
}
function savedFormula(result: ReportResult): { formula: ReportFormula; verified: boolean } {
  const snapshot = lerSnapshotFormula(result.formula_snapshot);
  return snapshot
    ? { formula: { ...result.formula, ...snapshot }, verified: true }
    : { formula: result.formula, verified: false };
}
const formulaKey = (f: ReportFormula) => JSON.stringify([f.nome.trim().toLocaleLowerCase('pt-BR'), f.codEvento?.trim() ?? '', f.tipo?.trim() ?? '', f.polaridade?.trim() ?? '']);
const personKey = (p: ReportPerson) => JSON.stringify([p.codcoligada, p.funcionario_id_rm.trim()]);
export type VariationRow = {
  key: string; nome: string; matricula: string; formula: string; tipo: string | null;
  anterior: string | null; atual: string | null; diferenca: string | null;
  percentual: string | null; situacao: string; observacao: string;
  versaoAtual: number | null; versaoAnterior: number | null;
  classificacaoMonetariaAtual: boolean; classificacaoMonetariaAnterior: boolean;
  polaridadeAtual: string | null; polaridadeAnterior: string | null;
  tipoAtualHistorico: string | null; tipoAnteriorHistorico: string | null;
};

export class VariationLimitError extends Error {
  constructor() { super('O limite de registros da comparação histórica foi atingido.'); }
}

/** Compare persisted calculated values, never final overrides or absent values as zero. */
export function variationRows(current: ReportPerson[], previous: ReportPerson[],
  currentExists: boolean, previousExists: boolean, configuredCurrent: ReportFormula[] = [], maxRows = Number.POSITIVE_INFINITY): VariationRow[] {
  const now = new Map(current.map(p => [personKey(p), p]));
  const before = new Map(previous.map(p => [personKey(p), p]));
  const duplicates = new Set<string>();
  for (const people of [current, previous]) {
    const seen = new Set<string>();
    for (const person of people) {
      const key = personKey(person);
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }
  }
  const knownFormulas = (people: ReportPerson[], configured: ReportFormula[] = []) => {
    const formulas = new Map(configured.map(f => [formulaKey(f), f]));
    for (const person of people) for (const result of person.execucao_funcionario) {
      const formula = savedFormula(result).formula;
      formulas.set(formulaKey(formula), formula);
    }
    return formulas;
  };
  const currentFormulas = knownFormulas(current, configuredCurrent), previousFormulas = knownFormulas(previous);
  const rows: VariationRow[] = [];
  for (const key of new Set([...now.keys(), ...before.keys()])) {
    const person = now.get(key), oldPerson = before.get(key);
    const group = (p: ReportPerson | undefined, expected: Map<string, ReportFormula>) => {
      const groups = new Map<string, ReportResult[]>();
      for (const r of p?.execucao_funcionario ?? []) {
        const fkey = formulaKey(savedFormula(r).formula);
        groups.set(fkey, [...(groups.get(fkey) ?? []), r]);
      }
      if (p) for (const [key, formula] of expected) if (!groups.has(key)) groups.set(key, [{
        formula, formula_snapshot: null, status: 'PREVIA', valor_calculado: null,
        revisao: 0, enviado_revisao: null, _count: { memoria_calculo: 0 },
      }]);
      return groups;
    };
    const a = group(person, currentFormulas), b = group(oldPerson, previousFormulas);
    const keys = new Set([...a.keys(), ...b.keys()]);
    if (!keys.size) keys.add('');
    for (const fkey of keys) {
      const currentResults = a.get(fkey) ?? [], previousResults = b.get(fkey) ?? [];
      const r = currentResults[0], old = previousResults[0];
      const formula = r ? savedFormula(r).formula : old ? savedFormula(old).formula : null;
      const snapshotAtual=r?lerSnapshotFormula(r.formula_snapshot):null;
      const snapshotAnterior=old?lerSnapshotFormula(old.formula_snapshot):null;
      const row: VariationRow = {
        key: JSON.stringify([key,fkey]), nome: person?.nome_funcionario ?? oldPerson?.nome_funcionario ?? 'Nome indisponível',
        matricula: person?.funcionario_id_rm ?? oldPerson!.funcionario_id_rm,
        formula: formula?.nome ?? 'Sem fórmulas registradas', tipo: formula?.tipo ?? null,
        atual: r && hasCalculatedValue(r) ? r.valor_calculado!.toString() : null,
        anterior: old && hasCalculatedValue(old) ? old.valor_calculado!.toString() : null,
        diferenca: null, percentual: null, situacao: '', observacao: '',
        versaoAtual:snapshotAtual?.versao??null,versaoAnterior:snapshotAnterior?.versao??null,
        classificacaoMonetariaAtual:snapshotAtual?.tipo==='V'&&['+','-'].includes(snapshotAtual.polaridade??''),
        classificacaoMonetariaAnterior:snapshotAnterior?.tipo==='V'&&['+','-'].includes(snapshotAnterior.polaridade??''),
        polaridadeAtual:snapshotAtual?.polaridade??null,polaridadeAnterior:snapshotAnterior?.polaridade??null,
        tipoAtualHistorico:typeof snapshotAtual?.tipo==='string'?snapshotAtual.tipo:null,
        tipoAnteriorHistorico:typeof snapshotAnterior?.tipo==='string'?snapshotAnterior.tipo:null,
      };
      if (duplicates.has(key)) {
        row.atual = row.anterior = null;
        row.situacao = 'Matrícula duplicada'; row.observacao = 'Há mais de um registro desta matrícula e coligada na execução. Consulte a origem antes de comparar.';
      } else if (currentResults.length > 1 || previousResults.length > 1) {
        row.atual = row.anterior = null;
        row.situacao = 'Fórmula ambígua'; row.observacao = 'Mais de uma fórmula com o mesmo nome, evento, tipo e polaridade. Consulte o extrato.';
      } else if (!currentExists || !previousExists) {
        row.situacao = !previousExists ? 'Sem execução anterior' : 'Sem execução atual';
      } else if (!person || !oldPerson) {
        row.situacao = !oldPerson ? 'Só na atual' : 'Só na anterior';
        row.observacao = 'Presença no processamento; não confirma admissão ou desligamento.';
      } else if (!r && !old) {
        row.situacao = 'Sem cálculo';
      } else if (!r || !old) {
        row.situacao = !old ? 'Sem fórmula anterior' : 'Sem fórmula atual';
      } else if (r.status === 'ERRO' || old.status === 'ERRO' ||
        ((person.status ?? '').startsWith('ERRO') && row.atual === null) ||
        ((oldPerson.status ?? '').startsWith('ERRO') && row.anterior === null)) {
        row.situacao = 'Erro de cálculo'; row.observacao = 'Consulte as pendências da execução para identificar a causa.';
      } else if (row.atual === null || row.anterior === null) {
        row.situacao = 'Sem cálculo';
      } else {
        const currentFormula = savedFormula(r), previousFormula = savedFormula(old);
        if (!currentFormula.verified || !previousFormula.verified) {
          row.situacao = 'Regra não verificável'; row.observacao = 'Snapshot da fórmula indisponível. Valores exibidos sem calcular a variação.';
        } else if (currentFormula.formula.versao !== previousFormula.formula.versao ||
          currentFormula.formula.expressao !== previousFormula.formula.expressao) {
          row.situacao = 'Fórmula alterada'; row.observacao = `Versão anterior ${previousFormula.formula.versao}; atual ${currentFormula.formula.versao}.`;
        } else {
          const previousValue = new Prisma.Decimal(row.anterior), currentValue = new Prisma.Decimal(row.atual);
          const difference = currentValue.minus(previousValue);
          row.diferenca = difference.toFixed(2);
          row.percentual = previousValue.isZero() ? null : difference.div(previousValue.abs()).times(100).toFixed(2);
          row.situacao = previousValue.isZero() ? 'Sem base percentual' : difference.isZero() ? 'Sem variação' : 'Com variação';
          if (previousValue.isZero()) row.observacao = 'Valor anterior igual a zero; a diferença absoluta continua disponível.';
        }
      }
      if(rows.length>=maxRows)throw new VariationLimitError();
      rows.push(row);
    }
  }
  return rows.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR') || a.matricula.localeCompare(b.matricula) || a.formula.localeCompare(b.formula,'pt-BR'));
}
