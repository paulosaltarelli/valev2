import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { http } from '../../shared/lib/http';
import { Modal } from '../../shared/components/VeModal';

type Orientacao = {
  estado: 'pronto' | 'aguardando_fila' | 'indisponivel';
  texto?: string;
  orientacao?: { filial: string; erro: string; possivelCausa: string; investigar: string; filialId?:number|null;periodoId?:number }[];
  competencia?: string;
  fonte?: string;
  consultadoEm?: string;
  links?: { texto: string; url: string }[];
};
type Casos = {periodoId:number;filialId:number;competencia:string;filial:string;consultadoEm?:string;fonte:string;total:number;parcial:boolean;mensagem?:string;casos:{nome:string;matricula:string;execucaoId:number;orientacao:string;evidencias:string;variaveis:string;formulas:string}[]};

export function OrientacaoInicial({ periodos }: { periodos: { periodoId: number; competencia: string }[] }) {
  const chave = periodos.map(p => p.periodoId).join(',');
  const [analises, setAnalises] = useState<Record<number, Orientacao>>({});
  const [carregando, setCarregando] = useState(false);
  const [painel,setPainel] = useState<{periodoId:number;filialId:number;titulo:string;dados?:Casos;erro?:string;carregando:boolean}|null>(null);
  const detalhesAbort=useRef<AbortController|null>(null);
  const fechar=()=>{detalhesAbort.current?.abort();setPainel(null);};
  const abrirErros=async(periodoId:number,filialId:number,titulo:string)=>{
    detalhesAbort.current?.abort();const controller=new AbortController();detalhesAbort.current=controller;
    setPainel({periodoId,filialId,titulo,carregando:true});
    try {
      const {data}=await http.post<Casos>('/assistente/inicio/erros',{periodoId,filialId},{signal:controller.signal,timeout:100000});
      if(!controller.signal.aborted)setPainel({periodoId,filialId,titulo,dados:data,carregando:false});
    } catch {
      if(!controller.signal.aborted)setPainel({periodoId,filialId,titulo,carregando:false,erro:'Não foi possível consultar os casos agora. Tente novamente.'});
    }
  };
  useEffect(()=>()=>detalhesAbort.current?.abort(),[]);
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
  if (!prontas.length && !painel) return carregando ? <p className="text-secondary small" role="status">Vale IA verificando se há orientação disponível…</p> : Object.values(analises).some(a => a.estado === 'indisponivel') ? <p className="text-secondary small" role="status">A orientação do Vale IA está temporariamente indisponível. Os indicadores abaixo continuam disponíveis.</p> : null;
  return (
    <><section className="card mb-4" aria-label="Orientação do Vale IA">
      <div className="card-body">
        <h2 className="ve-section-title">Orientação do Vale IA</h2>
        {prontas.map((p, i) => {
          const a = analises[p.periodoId];
          return <details key={p.periodoId} open={i === 0} className="mb-3">
            <summary className="fw-semibold">{a.competencia ?? p.competencia} · Pontos de atenção</summary>
            {a.orientacao?.length ? <div className="mt-3 overflow-auto">
              <table className="table table-sm align-middle mb-2" aria-label={`Orientação de ${a.competencia ?? p.competencia}`}>
                <thead><tr><th scope="col">Filial</th><th scope="col">Erro / pendência</th><th scope="col">Possível causa</th><th scope="col">O que investigar</th></tr></thead>
                <tbody>{a.orientacao.map((linha, n) => <tr key={n}><th scope="row">{linha.filial}</th><td>{linha.filialId ? <button type="button" className="btn btn-link p-0 text-start" aria-haspopup="dialog" aria-label={`${linha.erro} — ver funcionários de ${linha.filial} em ${a.competencia ?? p.competencia}`} onClick={()=>void abrirErros(linha.periodoId??p.periodoId,linha.filialId!,`${a.competencia??p.competencia} · ${linha.filial}`)}>{linha.erro}</button> : linha.erro}</td><td>{linha.possivelCausa}</td><td>{linha.investigar}</td></tr>)}</tbody>
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
    <Modal show={!!painel} onHide={fechar} size="xl" aria-labelledby="vale-ia-casos-titulo">
      <Modal.Header closeButton><Modal.Title id="vale-ia-casos-titulo">Funcionários com erro</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="fw-semibold">{painel?.dados ? `${painel.dados.competencia} · ${painel.dados.filial}` : painel?.titulo}</p>
        {painel?.carregando && <p role="status">Consultando os funcionários e as evidências…</p>}
        {painel?.erro && <div role="alert"><p>{painel.erro}</p><button type="button" className="btn btn-outline-primary" onClick={()=>void abrirErros(painel.periodoId,painel.filialId,painel.titulo)}>Tentar novamente</button></div>}
        {painel?.dados && <>
          {painel.dados.parcial && <p role="status">Mostrando {painel.dados.casos.length} de {painel.dados.total} registros. A análise é parcial.</p>}
          {!painel.dados.casos.length ? <p>{painel.dados.mensagem??'Não há funcionários com erro neste recorte agora.'}</p> : <div className="overflow-auto"><table className="table table-sm align-middle" aria-label="Funcionários afetados e o que investigar">
            <thead><tr><th scope="col">Funcionário</th><th scope="col">O que investigar neste caso</th></tr></thead>
            <tbody>{painel.dados.casos.map((caso,i)=><tr key={`${caso.execucaoId}:${caso.matricula}:${i}`}><th scope="row">{caso.nome||'Nome não disponível'}<div className="small fw-normal">Matrícula {caso.matricula}</div></th><td><p>{caso.orientacao}</p>
              <details><summary>Evidências e detalhes</summary><p style={{whiteSpace:'pre-wrap'}}>{caso.evidencias}</p><p>Variáveis: {caso.variaveis||'Não disponíveis'}</p><p>Fórmulas: {caso.formulas||'Não disponíveis'}</p></details>
              <Link to={`/processamento/${caso.execucaoId}?aba=pendencias&retorno=%2Fdashboard`} onClick={fechar}>Abrir execução</Link>
            </td></tr>)}</tbody>
          </table></div>}
          <p className="small text-secondary">{painel.dados.fonte}{painel.dados.consultadoEm&&` · Consulta em ${new Date(painel.dados.consultadoEm).toLocaleString('pt-BR')}`}</p>
        </>}
      </Modal.Body>
    </Modal></>
  );
}
