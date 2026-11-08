import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Form, Modal, Table } from "react-bootstrap";
import { Link } from "react-router";
import { isAxiosError } from "axios";
import { http } from "../../shared/lib/http";
import type { Filial } from "../../models/FilialModel";
import type { Periodo } from "../../models/PeriodoModel";

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
const nomeProvedor = {
  local: "Consultas do Vale",
  gpt: "GPT",
  claude: "Claude",
};
type Turno = { pergunta: string; resposta: string; em: string };
type Estado = { provedores: Provedor[]; historico: Turno[] };
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

export function AssistenteVale({
  periodo,
  filialId,
  periodos,
  filiais,
}: {
  periodo: Periodo | null;
  filialId: number;
  periodos: Periodo[];
  filiais: Filial[];
}) {
  const [estado, setEstado] = useState<Estado>();
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

  const abrir = () => {
    setCompetencia(periodo ? String(periodo.periodo_id) : "");
    setFilial(filialId > 0 ? String(filialId) : "");
    setMatricula("");
    setPergunta("");
    setResposta(undefined);
    setErro("");
    setAberto(true);
    void http
      .get<Estado>("/assistente")
      .then(({ data }) => setEstado(data))
      .catch(() => setErro("Falha ao carregar o histórico do assistente."));
  };

  const enviar = async (texto: string, consulta?: string) => {
    if (!texto.trim() || ocupado) return;
    setErro("");
    if (
      !consulta &&
      /\b(excel|xlsx|exportar|planilha)\b/i.test(texto) &&
      resposta?.tabela &&
      !resposta.tabela.parcial
    ) {
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
          periodoId: competencia ? Number(competencia) : undefined,
          filialId: filial ? Number(filial) : undefined,
          matricula: matricula.trim() || undefined,
        },
        { timeout: 30000 },
      );
      setResposta(data);
      setPergunta("");
      if (estado)
        setEstado({
          ...estado,
          historico: [
            ...estado.historico,
            {
              pergunta: texto,
              resposta: data.texto,
              em: new Date().toISOString(),
            },
          ].slice(-8),
        });
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
      <Button variant="outline-primary" size="sm" onClick={abrir}>
        Assistente do Vale
      </Button>
      <Modal
        show={aberto}
        onHide={() => setAberto(false)}
        size="lg"
        aria-labelledby="assistente-vale-titulo"
      >
        <Modal.Header closeButton>
          <Modal.Title id="assistente-vale-titulo">
            Assistente do Vale
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={submit}>
            <fieldset disabled={ocupado}>
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
                    {periodos.map((p) => (
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
                    {filiais.map((f) => (
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
              {estado.provedores.length > 1 && (
                <Form.Group className="mb-2" controlId="assistente-provedor">
                  <Form.Label>Provedor para interpretar a pergunta</Form.Label>
                  <Form.Select
                    value={provedor}
                    onChange={(e) => setProvedor(e.target.value as Provedor)}
                  >
                    {estado.provedores.map((id) => (
                      <option key={id} value={id}>
                        {nomeProvedor[id]}
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
                          <strong>{item.moeda ? moeda(item.valor) : item.valor.toLocaleString("pt-BR")}</strong>
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
                    <Link
                      key={link.url}
                      to={link.url}
                      onClick={() => setAberto(false)}
                    >
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
