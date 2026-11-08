import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Form, Table } from "react-bootstrap";
import { Link, useLocation } from "react-router";
import { isAxiosError } from "axios";
import { http } from "../../shared/lib/http";
import type { Filial } from "../../models/FilialModel";
import type { Periodo } from "../../models/PeriodoModel";
import { Modal } from "../../shared/components/VeModal";
import "./assistenteVale.css";

const sugestoes = [
  ["pendencias", "Quais filiais têm pendências?"],
  ["variaveis", "Quais variáveis já foram calculadas?"],
  ["erros", "Por que o valor não foi calculado?"],
  ["valores", "Mostrar valores por funcionário e fórmula"],
  ["comparacao", "O que mudou em relação à competência anterior?"],
  ["financeiro", "Gerar dashboard financeiro"],
  ["km", "Mostrar KM registrados"],
  ["formulas", "Ver cadastro atual de fórmulas"],
  ["ajuda", "Como funciona o Vale Expresso?"],
] as const;

type Provedor = "local" | "gpt" | "claude";
type ProvedorExterno = Exclude<Provedor, "local">;
type Conexoes = { id: ProvedorExterno; origem: "pessoal" | "vale" | null }[];
const nomeProvedor = {
  local: "Consultas do Vale",
  gpt: "GPT",
  claude: "Claude",
};
type Turno = { pergunta: string; resposta: string; em: string };
type Estado = { provedores: Conexoes; historico: Turno[] };
type Contexto = {
  periodos: Pick<Periodo, "periodo_id" | "competencia" | "ativo">[];
  filiais: Pick<Filial, "filial_id" | "nome">[];
  filtro: { periodo_id: number; filial_id: number } | null;
};
type Resposta = {
  texto: string;
  detalhes?: string;
  fonte?: string;
  consultadoEm?: string;
  competencia?: string;
  filial?: string;
  matricula?: string;
  tabela?: {
    colunas: string[];
    linhas: (string | number | null)[][];
    parcial: boolean;
  };
  grafico?: { rotulo: string; valor: number; moeda?: boolean }[];
  links?: { texto: string; url: string }[];
};

function MarcaAssistente() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M4.5 7.5h4l6.3 14.2 4.2-9.4h4.1l-6.8 15h-3.2L4.5 7.5Z"
        fill="currentColor"
      />
      <path
        d="M24.5 3.5v8m-4-4h8M7 23.5h2.5m-5 3.5H11"
        stroke="#FFD675"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AssistenteVale() {
  const location = useLocation();
  const [estado, setEstado] = useState<Estado>();
  const [contexto, setContexto] = useState<Contexto>();
  const [configurando, setConfigurando] = useState(false);
  const [provedorChave, setProvedorChave] = useState<ProvedorExterno>("gpt");
  const [chave, setChave] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [carregandoContexto, setCarregandoContexto] = useState(false);
  const [aviso, setAviso] = useState("");
  const [aberto, setAberto] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [provedor, setProvedor] = useState<Provedor>("local");
  const [competencia, setCompetencia] = useState("");
  const [filial, setFilial] = useState("");
  const [matricula, setMatricula] = useState("");
  const [resposta, setResposta] = useState<Resposta>();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void http
      .get<Estado>("/assistente", { signal: controller.signal })
      .then(({ data }) => setEstado(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const abrir = async () => {
    const params = new URLSearchParams(location.search);
    const execucao = /^\/processamento\/(\d+)$/.exec(location.pathname)?.[1];
    setCompetencia("");
    setFilial("");
    setMatricula("");
    setPergunta("");
    setResposta(undefined);
    setErro("");
    setAviso("");
    setAberto(true);
    setCarregandoContexto(true);
    try {
      const [{ data: sessao }, { data }] = await Promise.all([
        http.get<Estado>("/assistente"),
        http.get<Contexto>("/assistente/contexto", { params: { execucao } }),
      ]);
      setEstado(sessao);
      setProvedor((atual) =>
        sessao.provedores.some((p) => p.id === atual && p.origem)
          ? atual
          : "local",
      );
      setContexto(data);
      const periodo =
        data.filtro?.periodo_id ??
        params.get("periodoId") ??
        params.get("periodo");
      const filialId =
        data.filtro?.filial_id ??
        params.get("filialId") ??
        params.get("filial");
      const selecionado =
        data.periodos.find((p) => String(p.periodo_id) === String(periodo)) ??
        (!periodo && location.pathname === "/processamento"
          ? data.periodos.find((p) => p.ativo)
          : undefined);
      setCompetencia(selecionado ? String(selecionado.periodo_id) : "");
      if (data.filiais.some((f) => String(f.filial_id) === String(filialId))) {
        setFilial(String(filialId));
      }
    } catch {
      setErro("Falha ao carregar as opções do assistente.");
    } finally {
      setCarregandoContexto(false);
    }
  };

  const fechar = () => {
    setAberto(false);
    setConfigurando(false);
    setChave("");
  };

  const alterarChave = async (id: ProvedorExterno, novaChave?: string) => {
    setErro("");
    setAviso("");
    setSalvando(true);
    setChave("");
    try {
      const { data } = novaChave
        ? await http.post<Pick<Estado, "provedores">>(
            "/assistente/provedores",
            { provedor: id, chave: novaChave },
          )
        : await http.delete<Pick<Estado, "provedores">>(
            `/assistente/provedores/${id}`,
          );
      setEstado((atual) => atual && { ...atual, provedores: data.provedores });
      setProvedor((atual) => (novaChave ? id : atual === id ? "local" : atual));
      setAviso(
        novaChave
          ? "Chave adicionada a esta sessão."
          : "Chave pessoal removida desta sessão.",
      );
    } catch (e) {
      const mensagem = isAxiosError<{ message?: unknown }>(e)
        ? e.response?.data?.message
        : undefined;
      setErro(
        typeof mensagem === "string"
          ? mensagem
          : "Não foi possível atualizar a conexão.",
      );
    } finally {
      setSalvando(false);
    }
  };

  const enviar = async (texto: string, consulta?: string) => {
    if (!texto.trim() || ocupado) return;
    setErro("");
    const pedido = texto.trim();
    const exportar =
      /^(?:excel|xlsx|exportar|(?:gere|gerar|baixar)(?: um| uma)? (?:excel|xlsx|planilha))\s*[.!?]?$/i.test(
        pedido,
      ) ||
      (/\b(excel|xlsx|exportar|planilha)\b/i.test(pedido) &&
        /\b(desta consulta|da última consulta|dessa consulta|desta tabela|dessa tabela)\s*[.!?]?$/i.test(
          pedido,
        ));
    if (!consulta && exportar) {
      if (!resposta?.tabela || resposta.tabela.parcial) {
        setErro(
          "Consulte primeiro um recorte com tabela completa para baixar o Excel.",
        );
        return;
      }
      await baixarExcel();
      return;
    }
    setResposta(undefined);
    setMostrarTodas(false);
    setOcupado(true);
    try {
      const { data } = await http.post<Resposta>(
        "/assistente/consultar",
        {
          pergunta: texto,
          consulta,
          provedor,
          origemProvedor:
            estado?.provedores.find((p) => p.id === provedor)?.origem ??
            undefined,
          periodoId: competencia ? Number(competencia) : undefined,
          filialId: filial ? Number(filial) : undefined,
          matricula: matricula.trim() || undefined,
        },
        { timeout: 30000 },
      );
      setResposta(data);
      setPergunta("");
      setEstado(
        (atual) =>
          atual && {
            ...atual,
            historico: [
              ...atual.historico,
              {
                pergunta: texto,
                resposta: data.texto,
                em: new Date().toISOString(),
              },
            ].slice(-8),
          },
      );
    } catch (e) {
      const message = isAxiosError<{ message?: unknown }>(e)
        ? e.response?.data?.message
        : undefined;
      setErro(
        typeof message === "string" &&
          isAxiosError(e) &&
          (e.response?.status ?? 500) < 500
          ? message
          : "A consulta falhou. Tente novamente ou use uma consulta sugerida.",
      );
    } finally {
      setOcupado(false);
    }
  };

  const baixarExcel = async () => {
    if (!resposta?.tabela || resposta.tabela.parcial || exportando) return;
    setExportando(true);
    setErro("");
    try {
      const { gerarExcel } = await import("./assistenteExcel");
      const bytes = await gerarExcel(resposta.tabela, [
        ["Competência", resposta.competencia],
        ["Filial", resposta.filial],
        ["Matrícula", resposta.matricula],
        ["Origem", resposta.fonte],
        ["Consultado em", resposta.consultadoEm],
        ["Resumo", resposta.texto],
        ["Observações", resposta.detalhes],
      ]);
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `vale-expresso-${resposta.competencia?.replace("/", "-") ?? "relatorio"}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setErro("Falha ao gerar o Excel. Tente novamente.");
    } finally {
      setExportando(false);
    }
  };

  const mudarFiltro = (setter: (valor: string) => void, valor: string) => {
    setter(valor);
    setResposta(undefined);
  };
  const moeda = (valor: number) =>
    valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void enviar(pergunta);
  };
  if (!estado) return null;

  return (
    <>
      <button
        type="button"
        className="vale-ia-atalho"
        aria-label="Abrir Assistente do Vale"
        aria-haspopup="dialog"
        onClick={() => void abrir()}
      >
        <MarcaAssistente />
        <span aria-hidden="true">Vale IA</span>
      </button>
      <Modal
        show={aberto}
        onHide={fechar}
        scrollable={false}
        size="lg"
        className="vale-ia-modal"
        aria-labelledby="assistente-vale-titulo"
      >
        <Modal.Header closeButton>
          <Modal.Title id="assistente-vale-titulo">
            <span className="vale-ia-marca">
              <MarcaAssistente />
            </span>
            <span>
              <small>VALE IA</small>Assistente do Vale
            </span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex justify-content-end mb-3">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                setConfigurando(!configurando);
                setChave("");
              }}
              aria-expanded={configurando}
            >
              Conexões de IA
            </Button>
          </div>
          {configurando && (
            <Form
              className="vale-ia-conexoes mb-3"
              aria-label="Conexões de IA"
              onSubmit={(event) => {
                event.preventDefault();
                if (chave.trim() && !salvando)
                  void alterarChave(provedorChave, chave.trim());
              }}
            >
              <p className="small mb-2">
                Use uma chave da sua conta de API. Ela vale para esta sessão e o
                uso é cobrado no projeto da chave.
              </p>
              <fieldset disabled={salvando || ocupado}>
                <div className="row g-2 align-items-end">
                  <Form.Group
                    className="col-sm-3"
                    controlId="vale-ia-chave-provedor"
                  >
                    <Form.Label>Provedor</Form.Label>
                    <Form.Select
                      value={provedorChave}
                      onChange={(e) => {
                        setProvedorChave(e.target.value as ProvedorExterno);
                        setChave("");
                      }}
                    >
                      <option value="gpt">GPT</option>
                      <option value="claude">Claude</option>
                    </Form.Select>
                  </Form.Group>
                  <Form.Group className="col-sm" controlId="vale-ia-chave">
                    <Form.Label>Chave de API pessoal</Form.Label>
                    <Form.Control
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={512}
                      value={chave}
                      onChange={(e) => setChave(e.target.value)}
                    />
                  </Form.Group>
                  <div className="col-sm-auto">
                    <Button type="submit" size="sm" disabled={!chave.trim()}>
                      {salvando ? "Salvando…" : "Usar nesta sessão"}
                    </Button>
                  </div>
                </div>
                {estado.provedores
                  .filter((p) => p.origem === "pessoal")
                  .map((p) => (
                    <Button
                      key={p.id}
                      variant="link"
                      size="sm"
                      type="button"
                      onClick={() => void alterarChave(p.id)}
                    >
                      Remover chave pessoal de {nomeProvedor[p.id]}
                    </Button>
                  ))}
              </fieldset>
            </Form>
          )}
          {aviso && (
            <p className="small" role="status">
              {aviso}
            </p>
          )}
          {carregandoContexto && <p role="status">Carregando opções…</p>}
          <Form onSubmit={submit}>
            <fieldset disabled={ocupado || carregandoContexto || salvando}>
              <div className="row g-2 mb-3">
                <Form.Group
                  className="col-sm-4"
                  controlId="assistente-competencia"
                >
                  <Form.Label>Competência</Form.Label>
                  <Form.Select
                    value={competencia}
                    onChange={(e) =>
                      mudarFiltro(setCompetencia, e.target.value)
                    }
                  >
                    <option value="">Selecione</option>
                    {contexto?.periodos.map((p) => (
                      <option key={p.periodo_id} value={p.periodo_id}>
                        {p.competencia}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <Form.Group className="col-sm-4" controlId="assistente-filial">
                  <Form.Label>Filial</Form.Label>
                  <Form.Select
                    value={filial}
                    onChange={(e) => mudarFiltro(setFilial, e.target.value)}
                  >
                    <option value="">Todas as filiais ativas</option>
                    {contexto?.filiais.map((f) => (
                      <option key={f.filial_id} value={f.filial_id}>
                        {f.nome}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <Form.Group
                  className="col-sm-4"
                  controlId="assistente-matricula"
                >
                  <Form.Label>Matrícula (opcional)</Form.Label>
                  <Form.Control
                    value={matricula}
                    maxLength={50}
                    onChange={(e) => mudarFiltro(setMatricula, e.target.value)}
                  />
                </Form.Group>
              </div>
              <div
                className="d-flex flex-wrap gap-2 mb-3"
                aria-label="Consultas sugeridas"
              >
                {sugestoes.map(([id, texto]) => (
                  <Button
                    key={id}
                    type="button"
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => void enviar(texto, id)}
                  >
                    {texto}
                  </Button>
                ))}
              </div>
              {estado.provedores.some((p) => p.origem) && (
                <Form.Group className="mb-2" controlId="assistente-provedor">
                  <Form.Label>Provedor para interpretar a pergunta</Form.Label>
                  <Form.Select
                    value={provedor}
                    onChange={(e) => setProvedor(e.target.value as Provedor)}
                  >
                    <option value="local">{nomeProvedor.local}</option>
                    {estado.provedores
                      .filter((p) => p.origem)
                      .map(({ id, origem }) => (
                        <option key={id} value={id}>
                          {nomeProvedor[id]} ·{" "}
                          {origem === "pessoal"
                            ? "chave pessoal"
                            : "projeto do Vale"}
                        </option>
                      ))}
                  </Form.Select>
                  {provedor !== "local" && (
                    <Form.Text>
                      O texto digitado será enviado ao provedor. Informe
                      matrículas no filtro acima e mantenha dados pessoais fora
                      da pergunta.
                    </Form.Text>
                  )}
                </Form.Group>
              )}
              <Form.Group controlId="assistente-pergunta">
                <Form.Label>Pergunta</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  maxLength={500}
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                />
              </Form.Group>
              <Button
                type="submit"
                size="sm"
                className="mt-2"
                disabled={!pergunta.trim()}
              >
                Consultar
              </Button>
            </fieldset>
          </Form>
          <div aria-live="polite" className="mt-3">
            {ocupado && <p role="status">Consultando o Vale…</p>}
            {erro && <Alert variant="warning">{erro}</Alert>}
            {resposta && (
              <>
                <p className="fw-semibold mb-2">{resposta.texto}</p>
                {resposta.fonte && (
                  <p className="small text-body-secondary">
                    {[
                      resposta.competencia,
                      resposta.filial,
                      resposta.matricula && `Matrícula ${resposta.matricula}`,
                      resposta.fonte,
                      resposta.consultadoEm &&
                        `Consulta em ${new Date(resposta.consultadoEm).toLocaleString("pt-BR")}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {resposta.detalhes && (
                  <details className="mb-2">
                    <summary>Como interpretar</summary>
                    <p>{resposta.detalhes}</p>
                  </details>
                )}
                {resposta.grafico && (
                  <div
                    className="row g-2 mb-3"
                    aria-label="Indicadores da consulta"
                  >
                    {resposta.grafico.map((item) => (
                      <div key={item.rotulo} className="col-sm-4">
                        <div className="border rounded p-2">
                          <div>{item.rotulo}</div>
                          <strong>
                            {item.moeda
                              ? moeda(item.valor)
                              : item.valor.toLocaleString("pt-BR")}
                          </strong>
                          <div className="progress mt-2" aria-hidden="true">
                            <div
                              className="progress-bar"
                              style={{
                                width: `${(100 * Math.abs(item.valor)) / Math.max(1, ...resposta.grafico!.map((p) => Math.abs(p.valor)))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {resposta.tabela && (
                  <>
                    {resposta.tabela.parcial && (
                      <p className="text-warning-emphasis">
                        A consulta excedeu 2.000 linhas. Refine o filtro para
                        exportar.
                      </p>
                    )}
                    {!resposta.tabela.parcial && (
                      <Button
                        size="sm"
                        variant="outline-primary"
                        disabled={exportando}
                        onClick={() => void baixarExcel()}
                      >
                        {exportando ? "Gerando…" : "Baixar Excel"}
                      </Button>
                    )}
                    <details className="mt-2">
                      <summary>
                        Ver tabela ({resposta.tabela.linhas.length} linhas)
                      </summary>
                      <Table responsive size="sm" striped>
                        <thead>
                          <tr>
                            {resposta.tabela.colunas.map((c) => (
                              <th key={c} scope="col">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {resposta.tabela.linhas
                            .slice(0, mostrarTodas ? undefined : 30)
                            .map((linha, i) => (
                              <tr key={i}>
                                {linha.map((valor, j) => (
                                  <td key={j}>{valor ?? "—"}</td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </Table>
                      {resposta.tabela.linhas.length > 30 && (
                        <Button
                          size="sm"
                          variant="link"
                          onClick={() => setMostrarTodas(!mostrarTodas)}
                        >
                          {mostrarTodas
                            ? "Mostrar 30 linhas"
                            : "Mostrar todas as linhas"}
                        </Button>
                      )}
                    </details>
                  </>
                )}
                <div className="d-flex gap-3 mt-2">
                  {resposta.links?.map((link) => (
                    <Link key={link.url} to={link.url} onClick={fechar}>
                      {link.texto}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
          {estado.historico.length > 0 && (
            <details className="mt-3">
              <summary>Histórico desta sessão</summary>
              <ol>
                {estado.historico.map((turno, i) => (
                  <li key={i}>
                    <strong>{turno.pergunta}</strong>
                    <br />
                    {turno.resposta}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}
