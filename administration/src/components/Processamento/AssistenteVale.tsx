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

import { contextoDaPergunta } from "./contextoDaPergunta";

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

type Turno = { pergunta: string; resposta: string; em: string };
type Mensagem = {
  id: number;
  pergunta: string;
  resposta: Resposta | null;
  erro?: string;
};
const nomesDosProvedores = {
  gpt: "ChatGPT pessoal",
  claude: "Claude institucional",
  "gpt-institucional": "GPT institucional",
};
type Provedor = keyof typeof nomesDosProvedores;
type Estado = {
  historico: Turno[];
  provedores: {
    id: Provedor;
    habilitado: boolean;
    disponivel: boolean;
  }[];
};
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

function AvatarVale() {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" focusable="false">
      <circle cx="48" cy="48" r="47" fill="#e4f2ed" />
      <path
        d="M15 78c7-12 18-17 33-17s26 5 33 17c-8 10-20 16-33 16s-25-6-33-16Z"
        fill="#245d50"
      />
      <path d="M35 64l13 16 13-16" stroke="#88c0a9" strokeWidth="4" />
      <rect
        x="22"
        y="34"
        width="52"
        height="33"
        rx="16"
        fill="#fdfcf6"
        stroke="#16433a"
        strokeWidth="3"
      />
      <rect x="28" y="38" width="40" height="20" rx="10" fill="#16433a" />
      <path
        d="M37 48c0-4 5-4 5 0m12 0c0-4 5-4 5 0"
        stroke="#b0ead0"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M44 61c2 2 6 2 8 0"
        stroke="#245d50"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22 34a26 26 0 0 1 52 0H22Z"
        fill="#245d50"
        stroke="#16433a"
        strokeWidth="3"
      />
      <path
        d="M29 34h44M43 18l5 9 5-9"
        stroke="#ffd675"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M78 21v10m-5-5h10"
        stroke="#a07121"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AssistenteVale() {
  const location = useLocation();
  const [disponivel, setDisponivel] = useState(false);
  const [contexto, setContexto] = useState<Contexto>();
  const [carregandoContexto, setCarregandoContexto] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<"conversa" | "acessos">("conversa");
  const [pergunta, setPergunta] = useState("");
  const [provedores, setProvedores] = useState<Estado["provedores"]>();
  const [preferencia, setPreferencia] = useState<Provedor>();
  const provedor =
    provedores?.find(({ id, disponivel }) => disponivel && id === preferencia)
      ?.id ??
    provedores?.find(({ disponivel }) => disponivel)?.id ??
    (provedores?.length === 0 ? "local" : undefined);
  const [competencia, setCompetencia] = useState("");
  const [filial, setFilial] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const proximoId = useRef(0);
  const perguntaSemFilial = useRef<{ texto: string; consulta?: string }>(null);
  const fimDaConversa = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [exportando, setExportando] = useState<Resposta>();

  useEffect(() => {
    const controller = new AbortController();
    void http
      .get<Estado>("/assistente", { signal: controller.signal })
      .then(({ data }) => {
        setDisponivel(true);
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
    if (aberto && aba === "conversa") {
      fimDaConversa.current?.scrollIntoView({ block: "end" });
    }
  }, [aberto, aba, mensagens]);

  const abrir = async () => {
    const params = new URLSearchParams(location.search);
    const execucao = /^\/processamento\/(\d+)$/.exec(location.pathname)?.[1];
    perguntaSemFilial.current = null;
    setCompetencia("");
    setFilial("");
    setContexto(undefined);
    setProvedores(undefined);
    setErro("");
    setAberto(true);
    setAba("conversa");
    setCarregandoContexto(true);
    try {
      const [{ data }, { data: estado }] = await Promise.all([
        http.get<Contexto>("/assistente/contexto", { params: { execucao } }),
        http.get<Estado>("/assistente"),
      ]);
      setProvedores(estado.provedores.filter(({ habilitado }) => habilitado));
      const periodos = data.periodos.filter((item) => item.ativo);
      setContexto({ ...data, periodos });
      const periodo =
        data.filtro?.periodo_id ??
        params.get("periodoId") ??
        params.get("periodo");
      const filialId =
        data.filtro?.filial_id ??
        params.get("filialId") ??
        params.get("filial");
      const selecionado =
        periodos.find((p) => String(p.periodo_id) === String(periodo)) ??
        periodos[0];
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
    if (!texto.trim() || ocupado || carregandoContexto || !provedor) return;
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
    const pendente = perguntaSemFilial.current;
    perguntaSemFilial.current = null;
    const filialInformada = pendente
      ? contextoDaPergunta(pedido, contexto, competencia, "").filialId
      : undefined;
    const nomeFilial = contexto?.filiais.find(
      (item) => item.filial_id === filialInformada,
    )?.nome;
    const completouPergunta =
      pendente &&
      nomeFilial &&
      pedido
        .replace(/^filial\s+(?:de\s+)?/i, "")
        .replace(/[.!?]+$/, "")
        .localeCompare(nomeFilial.replace(/^filial\s+/i, ""), "pt-BR", {
          sensitivity: "base",
        }) === 0;
    const textoConsulta = completouPergunta
      ? pendente.texto + " · " + pedido
      : pedido;
    const consultaEfetiva = completouPergunta ? pendente.consulta : consulta;
    const { aviso, ...filtros } = contextoDaPergunta(
      textoConsulta,
      contexto,
      competencia,
      filial,
    );
    if (completouPergunta) filtros.filialId = filialInformada;
    if (aviso) {
      setMensagens((atuais) =>
        atuais.map((mensagem) =>
          mensagem.id === id
            ? { ...mensagem, resposta: { texto: aviso } }
            : mensagem,
        ),
      );
      return;
    }
    setOcupado(true);
    try {
      const { data } = await http.post<Resposta>(
        "/assistente/consultar",
        {
          pergunta: textoConsulta.slice(0, 500),
          consulta: consultaEfetiva,
          provedor,
          ...filtros,
        },
        { timeout: 30000 },
      );
      const faltaFilial =
        data.texto === "Selecione uma filial para esta consulta.";
      if (faltaFilial)
        perguntaSemFilial.current = {
          texto: textoConsulta,
          consulta: consultaEfetiva,
        };
      const resposta = faltaFilial
        ? {
            ...data,
            texto:
              "Qual filial você quer consultar? Pode responder só com o nome.",
          }
        : data.texto === "Selecione uma competência para consultar os dados."
          ? {
              ...data,
              texto: "Não há competência ativa disponível para esta consulta.",
            }
          : data;
      if (data.competencia && filtros.periodoId)
        setCompetencia(String(filtros.periodoId));
      if (data.filial)
        setFilial(filtros.filialId ? String(filtros.filialId) : "");
      setMensagens((atuais) =>
        atuais.map((mensagem) =>
          mensagem.id === id ? { ...mensagem, resposta } : mensagem,
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
  if (!disponivel) return null;
  const periodoAtivo = contexto?.periodos.find(
    (item) => String(item.periodo_id) === competencia,
  )?.competencia;
  const filialAtiva = contexto?.filiais.find(
    (item) => String(item.filial_id) === filial,
  )?.nome;

  return (
    <>
      <button
        type="button"
        className="vale-ia-atalho"
        aria-label="Abrir Assistente do Vale"
        aria-haspopup="dialog"
        onClick={() => void abrir()}
      >
        <span className="vale-ia-atalho-texto" aria-hidden="true">
          <strong>Vale IA</strong>
          <small>Seu assistente no Vale</small>
        </span>
        <AvatarVale />
      </button>
      <Modal
        show={aberto}
        onHide={fechar}
        scrollable={false}
        size="xl"
        fullscreen="sm-down"
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
          <nav className="vale-ia-navegacao" aria-label="Áreas do Vale IA">
            <button
              type="button"
              aria-pressed={aba === "conversa"}
              onClick={() => setAba("conversa")}
            >
              Conversa
            </button>
            <button
              type="button"
              aria-pressed={aba === "acessos"}
              onClick={() => setAba("acessos")}
            >
              Contexto e acessos
            </button>
          </nav>
          <div className="vale-ia-paineis">
            <aside
              className="vale-ia-lateral"
              aria-label="Contas do Vale IA"
              hidden={aba === "acessos"}
            >
              <div className="vale-ia-identidade">
                <AvatarVale />
                <strong>Vale IA</strong>
                <p>Seu assistente para entender a operação.</p>
              </div>
              <ContasVale provedores={provedores} />
            </aside>
            <section
              className="vale-ia-painel"
              aria-label="Conversa"
              hidden={aba !== "conversa"}
            >
              <div className="vale-ia-contexto">
                <div>
                  <strong>Converse sobre o Vale</strong>
                  <small>Consultas com o contexto da sua tela</small>
                </div>
                {contexto && (
                  <span>
                    {periodoAtivo ?? "Sem competência ativa"}
                    {filialAtiva && " · " + filialAtiva}
                  </span>
                )}
              </div>
              <div
                className="vale-ia-conversa"
                role="log"
                aria-label="Conversa com o Vale IA"
                tabIndex={0}
              >
                {!mensagens.length && (
                  <div className="vale-ia-boas-vindas">
                    <h2>Como posso ajudar?</h2>
                    <p>Digite sua pergunta ou experimente um dos exemplos.</p>
                    <fieldset
                      disabled={ocupado || carregandoContexto || !provedor}
                    >
                      <div
                        className="vale-ia-exemplos"
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
                {mensagens.map(
                  ({ id, pergunta: texto, resposta, erro: falha }) => (
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
                  ),
                )}
                {carregandoContexto && <p role="status">Carregando opções…</p>}
                {!!provedores?.length && !provedor && (
                  <p role="status">
                    {provedores.some(({ id }) => id === "gpt")
                      ? "O login pessoal do ChatGPT aguarda liberação da OpenAI."
                      : "O provedor institucional está indisponível."}
                  </p>
                )}
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
                  disabled={
                    !pergunta.trim() ||
                    ocupado ||
                    carregandoContexto ||
                    !provedor
                  }
                >
                  Enviar
                </Button>
              </Form>
            </section>
            <section
              className="vale-ia-acessos"
              aria-label="Contexto e acessos"
              hidden={aba !== "acessos"}
            >
              <h2>Contexto e acessos</h2>
              <dl>
                <dt>Competência</dt>
                <dd>{periodoAtivo ?? "Sem competência ativa"}</dd>
                <dt>Filial</dt>
                <dd>{filialAtiva ?? "Definida pela pergunta"}</dd>
              </dl>
              <p>
                O Vale IA aproveita a competência ativa e a filial da tela. Você
                também pode citar uma filial na sua mensagem.
              </p>
              <ContasVale provedores={provedores} />
              {provedores && provedores.length > 1 && (
                <Form.Group controlId="vale-ia-provedor" className="mt-3">
                  <Form.Label>Provedor da conversa</Form.Label>
                  <Form.Select
                    value={provedor ?? ""}
                    disabled={ocupado}
                    onChange={(event) => {
                      const escolhido = provedores.find(
                        ({ id, disponivel }) =>
                          disponivel && id === event.target.value,
                      );
                      if (escolhido) setPreferencia(escolhido.id);
                    }}
                  >
                    {!provedor && (
                      <option value="">Nenhum provedor disponível</option>
                    )}
                    {provedores.map(({ id, disponivel }) => (
                      <option key={id} value={id} disabled={!disponivel}>
                        {nomesDosProvedores[id]}
                        {!disponivel && " (indisponível)"}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Text>
                    O texto da pergunta é enviado ao provedor escolhido para
                    interpretar a consulta.
                  </Form.Text>
                </Form.Group>
              )}
            </section>
          </div>
        </Modal.Body>
      </Modal>
    </>
  );
}

function ContasVale({ provedores }: { provedores?: Estado["provedores"] }) {
  if (!provedores) return null;
  return (
    <div className="vale-ia-contas">
      <h3>Provedores</h3>
      {provedores.map(({ id, disponivel }) => (
        <div key={id}>
          <strong>{nomesDosProvedores[id]}</strong>
          <span>
            {disponivel
              ? "Disponível"
              : id === "gpt"
                ? "Aguardando liberação da OpenAI"
                : "Aguardando configuração institucional"}
          </span>
        </div>
      ))}
      {provedores.length === 0 && (
        <p>Consultas do Vale disponíveis nesta sessão.</p>
      )}
    </div>
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
