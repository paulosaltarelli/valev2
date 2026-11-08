import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
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
type Conexoes = { id: ProvedorExterno; disponivel: boolean }[];
const nomeProvedor = {
  local: "Consultas do Vale",
  gpt: "GPT",
  claude: "Claude",
};
type Turno = { pergunta: string; resposta: string; em: string };
type Mensagem = {
  id: number;
  pergunta: string;
  resposta: Resposta | null;
  erro?: string;
};
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
  const [carregandoContexto, setCarregandoContexto] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [provedor, setProvedor] = useState<Provedor>("local");
  const [competencia, setCompetencia] = useState("");
  const [filial, setFilial] = useState("");
  const [matricula, setMatricula] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const proximoId = useRef(0);
  const fimDaConversa = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [exportando, setExportando] = useState<Resposta>();

  useEffect(() => {
    const controller = new AbortController();
    void http
      .get<Estado>("/assistente", { signal: controller.signal })
      .then(({ data }) => {
        setEstado(data);
        setMensagens(
          data.historico.map((turno) => ({
            id: proximoId.current++,
            pergunta: turno.pergunta,
            resposta: { texto: turno.resposta },
          })),
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (aberto) fimDaConversa.current?.scrollIntoView({ block: "end" });
  }, [aberto, mensagens]);

  const abrir = async () => {
    const params = new URLSearchParams(location.search);
    const execucao = /^\/processamento\/(\d+)$/.exec(location.pathname)?.[1];
    setCompetencia("");
    setFilial("");
    setMatricula("");
    setErro("");
    setAberto(true);
    setCarregandoContexto(true);
    try {
      const [{ data: sessao }, { data }] = await Promise.all([
        http.get<Estado>("/assistente"),
        http.get<Contexto>("/assistente/contexto", { params: { execucao } }),
      ]);
      setEstado(sessao);
      setProvedor((atual) =>
        sessao.provedores.some((p) => p.id === atual && p.disponivel)
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

  const fechar = () => setAberto(false);

  const enviar = async (texto: string, consulta?: string) => {
    if (!texto.trim() || ocupado || carregandoContexto) return;
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
      const resposta = [...mensagens]
        .reverse()
        .find((mensagem) => mensagem.resposta)?.resposta;
      if (!resposta?.tabela || resposta.tabela.parcial) {
        setErro(
          "Consulte primeiro um recorte com tabela completa para baixar o Excel.",
        );
        return;
      }
      await baixarExcel(resposta);
      setPergunta("");
      return;
    }
    const id = proximoId.current++;
    setPergunta("");
    setMensagens((atuais) => [
      ...atuais.slice(-7),
      { id, pergunta: pedido, resposta: null },
    ]);
    setOcupado(true);
    try {
      const { data } = await http.post<Resposta>(
        "/assistente/consultar",
        {
          pergunta: pedido,
          consulta,
          provedor,
          periodoId: competencia ? Number(competencia) : undefined,
          filialId: filial ? Number(filial) : undefined,
          matricula: matricula.trim() || undefined,
        },
        { timeout: 30000 },
      );
      setMensagens((atuais) =>
        atuais.map((mensagem) =>
          mensagem.id === id ? { ...mensagem, resposta: data } : mensagem,
        ),
      );
    } catch (e) {
      const message = isAxiosError<{ message?: unknown }>(e)
        ? e.response?.data?.message
        : undefined;
      const falha =
        typeof message === "string" &&
        isAxiosError(e) &&
        (e.response?.status ?? 500) < 500
          ? message
          : "A consulta falhou. Tente enviar a pergunta novamente.";
      setMensagens((atuais) =>
        atuais.map((mensagem) =>
          mensagem.id === id ? { ...mensagem, erro: falha } : mensagem,
        ),
      );
    } finally {
      setOcupado(false);
    }
  };

  const baixarExcel = async (resposta: Resposta) => {
    if (!resposta.tabela || resposta.tabela.parcial || exportando) return;
    setExportando(resposta);
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
      setExportando(undefined);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void enviar(pergunta);
  };
  const atalhosDeTeclado = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void enviar(pergunta);
    }
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
        <Modal.Body className="vale-ia-corpo">
          <details className="vale-ia-contexto">
            <summary>
              Contexto e filtros{" "}
              {contexto?.periodos.find(
                (item) => String(item.periodo_id) === competencia,
              )?.competencia ?? ""}
              {filial
                ? " · " +
                  (contexto?.filiais.find(
                    (item) => String(item.filial_id) === filial,
                  )?.nome ?? "")
                : ""}
            </summary>
            <fieldset disabled={ocupado || carregandoContexto}>
              <div className="row g-2 mb-3">
                <Form.Group
                  className="col-sm-4"
                  controlId="assistente-competencia"
                >
                  <Form.Label>Competência</Form.Label>
                  <Form.Select
                    value={competencia}
                    onChange={(e) => setCompetencia(e.target.value)}
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
                    onChange={(e) => setFilial(e.target.value)}
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
                    onChange={(e) => setMatricula(e.target.value)}
                  />
                </Form.Group>
              </div>

              {estado.provedores.some((p) => p.disponivel) && (
                <Form.Group className="mb-2" controlId="assistente-provedor">
                  <Form.Label>Provedor para interpretar a pergunta</Form.Label>
                  <Form.Select
                    value={provedor}
                    onChange={(e) => setProvedor(e.target.value as Provedor)}
                  >
                    <option value="local">{nomeProvedor.local}</option>
                    {estado.provedores
                      .filter((p) => p.disponivel)
                      .map(({ id }) => (
                        <option key={id} value={id}>
                          {nomeProvedor[id]} · projeto do Vale
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
            </fieldset>
          </details>
          <div
            className="vale-ia-conversa"
            role="log"
            aria-label="Conversa com o Vale IA"
            tabIndex={0}
          >
            {!mensagens.length && (
              <div className="vale-ia-balao vale-ia-resposta">
                <strong>Vale IA</strong>
                <p className="mb-2">
                  Olá! Como posso ajudar com o Vale Expresso?
                </p>
                <fieldset disabled={ocupado || carregandoContexto}>
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
                </fieldset>
              </div>
            )}
            {mensagens.map(({ id, pergunta: texto, resposta, erro: falha }) => (
              <div className="vale-ia-turno" key={id}>
                <div className="vale-ia-balao vale-ia-pergunta">
                  <span className="visually-hidden">Você: </span>
                  {texto}
                </div>
                <div className="vale-ia-balao vale-ia-resposta">
                  <strong className="vale-ia-autor">Vale IA</strong>
                  {resposta ? (
                    <MensagemVale
                      resposta={resposta}
                      fechar={fechar}
                      baixar={() => void baixarExcel(resposta)}
                      exportando={exportando}
                    />
                  ) : falha ? (
                    <p className="mb-0">{falha}</p>
                  ) : (
                    <p role="status" className="mb-0">
                      Consultando o Vale…
                    </p>
                  )}
                </div>
              </div>
            ))}
            {carregandoContexto && <p role="status">Carregando opções…</p>}
            {erro && <Alert variant="warning">{erro}</Alert>}
            <div ref={fimDaConversa} />
          </div>
          <Form className="vale-ia-compor" onSubmit={submit}>
            <Form.Control
              as="textarea"
              rows={2}
              maxLength={500}
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={atalhosDeTeclado}
              aria-label="Mensagem"
              placeholder="Escreva sua mensagem…"
            />
            <Button
              type="submit"
              disabled={!pergunta.trim() || ocupado || carregandoContexto}
            >
              Enviar
            </Button>
          </Form>
        </Modal.Body>
      </Modal>
    </>
  );
}

function MensagemVale({
  resposta,
  fechar,
  baixar,
  exportando,
}: {
  resposta: Resposta;
  fechar: () => void;
  baixar: () => void;
  exportando?: Resposta;
}) {
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const moeda = (valor: number) =>
    valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
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
        <div className="row g-2 mb-3" aria-label="Indicadores da consulta">
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
              A consulta excedeu 2.000 linhas. Refine o filtro para exportar.
            </p>
          )}
          {!resposta.tabela.parcial && (
            <Button
              size="sm"
              variant="outline-primary"
              disabled={Boolean(exportando)}
              onClick={baixar}
            >
              {exportando === resposta ? "Gerando…" : "Baixar Excel"}
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
                {mostrarTodas ? "Mostrar 30 linhas" : "Mostrar todas as linhas"}
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
  );
}
