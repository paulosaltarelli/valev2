import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { http } from '../../shared/lib/http';

type Orientacao = {
  estado: 'pronto' | 'aguardando_fila' | 'indisponivel';
  texto?: string;
  orientacao?: { filial: string; erro: string; possivelCausa: string; investigar: string }[];
  competencia?: string;
  fonte?: string;
  consultadoEm?: string;
  links?: { texto: string; url: string }[];
};

export function OrientacaoInicial({ periodos }: { periodos: { periodoId: number; competencia: string }[] }) {
  const chave = periodos.map(p => p.periodoId).join(',');
  const [analises, setAnalises] = useState<Record<number, Orientacao>>({});
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setAnalises({});
    const atualizar = async () => {
      if (!document.hidden) {
        setCarregando(true);
        // O limite por usuário é compartilhado com o chat. Evite disparar modelos em paralelo.
        for (const id of chave.split(',').filter(Boolean).map(Number)) {
          if (controller.signal.aborted) return;
          try {
            const { data } = await http.post<Orientacao>('/assistente/inicio', { periodoId: id }, { signal: controller.signal, timeout: 100000 });
            if (!controller.signal.aborted) setAnalises(old => ({ ...old, [id]: data }));
          } catch {
            if (!controller.signal.aborted) setAnalises(old => ({ ...old, [id]: { estado: 'indisponivel' } }));
          }
        }
        if (!controller.signal.aborted) setCarregando(false);
      }
      if (!controller.signal.aborted) timer = setTimeout(atualizar, 60000);
    };
    void atualizar();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [chave]);

  const prontas = periodos.filter(p => analises[p.periodoId]?.estado === 'pronto');
  if (!prontas.length) return carregando ? <p className="text-secondary small" role="status">Vale IA verificando se há orientação disponível…</p> : Object.values(analises).some(a => a.estado === 'indisponivel') ? <p className="text-secondary small" role="status">A orientação do Vale IA está temporariamente indisponível. Os indicadores abaixo continuam disponíveis.</p> : null;
  return (
    <section className="card mb-4" aria-label="Orientação do Vale IA">
      <div className="card-body">
        <h2 className="ve-section-title">Orientação do Vale IA</h2>
        {prontas.map((p, i) => {
          const a = analises[p.periodoId];
          return <details key={p.periodoId} open={i === 0} className="mb-3">
            <summary className="fw-semibold">{a.competencia ?? p.competencia} · Pontos de atenção</summary>
            {a.orientacao?.length ? <div className="mt-3 overflow-auto">
              <table className="table table-sm align-middle mb-2" aria-label={`Orientação de ${a.competencia ?? p.competencia}`}>
                <thead><tr><th scope="col">Filial</th><th scope="col">Erro / pendência</th><th scope="col">Possível causa</th><th scope="col">O que investigar</th></tr></thead>
                <tbody>{a.orientacao.map((linha, n) => <tr key={n}><th scope="row">{linha.filial}</th><td>{linha.erro}</td><td>{linha.possivelCausa}</td><td>{linha.investigar}</td></tr>)}</tbody>
              </table>
            </div> : <p className="mt-3" style={{ whiteSpace: 'pre-wrap' }}>{a.texto}</p>}
            <p className="text-secondary small">{a.fonte ?? 'Banco do Vale'}{a.consultadoEm && ` · Consulta em ${new Date(a.consultadoEm).toLocaleString('pt-BR')}`}</p>
            <div className="d-flex flex-wrap gap-3">
              <Link to={`/processamento?periodo=${p.periodoId}`}>Abrir processamentos</Link>
              {(a.links ?? []).filter((l, index, all) => l.url.startsWith('/') && !l.url.startsWith('//') && all.findIndex(x => x.url === l.url) === index).map(l => <Link key={l.url} to={l.url}>{l.texto}</Link>)}
            </div>
          </details>;
        })}
      </div>
    </section>
  );
}
