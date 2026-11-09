import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Form } from "react-bootstrap";
import { isAxiosError } from "axios";
import { PageHeading } from "../../shared/components/PageHeading";
import { http } from "../../shared/lib/http";

const modelosGpt = {
  "gpt-5.4-mini": "GPT-5.4 mini",
  "gpt-5.4-nano": "GPT-5.4 nano",
};

const modelosClaude = {
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
};

function opcoesDeModelo(modelos: Record<string, string>, atual: string) {
  return (
    <>
      {atual && !Object.hasOwn(modelos, atual) && (
        <option value={atual}>{atual} (modelo salvo)</option>
      )}
      {Object.entries(modelos).map(([id, nome]) => (
        <option key={id} value={id}>
          {nome}
        </option>
      ))}
    </>
  );
}

type Configuracao = {
  ativo: boolean;
  gptAtivo: boolean;
  gptInstitucionalAtivo: boolean;
  gptModelo: string;
  gptCredencialConfigurada: boolean;
  modelo: string;
  credencialConfigurada: boolean;
};

export function AssistenteConfiguracaoPage() {
  const [config, setConfig] = useState<Configuracao>();
  const [acao, setAcao] = useState<"salvar" | "claude" | "gpt-institucional">();
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [chave, setChave] = useState("");
  const [gptChave, setGptChave] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void http
      .get<Configuracao>("/assistente/configuracao", {
        signal: controller.signal,
      })
      .then(({ data }) => setConfig(data))
      .catch(() => {
        if (!controller.signal.aborted)
          setErro("Não foi possível carregar a configuração.");
      });
    return () => controller.abort();
  }, []);

  const executar = async (operacao: NonNullable<typeof acao>) => {
    if (!config || acao) return;
    setAcao(operacao);
    setErro("");
    setMensagem("");
    const dados = {
      ativo: config.ativo,
      modelo: config.modelo.trim(),
      chave: chave.trim() || undefined,
      gptModelo: config.gptModelo.trim(),
      gptChave: gptChave.trim() || undefined,
    };
    try {
      if (operacao !== "salvar") {
        await http.post("/assistente/configuracao/testar", {
          ativo: dados.ativo,
          modelo: dados.modelo,
          provedorTeste: operacao,
          ...(operacao === "claude"
            ? { chave: dados.chave }
            : { gptChave: dados.gptChave, gptModelo: dados.gptModelo }),
        });
        setMensagem(
          operacao === "claude"
            ? "Claude respondeu à pergunta de teste."
            : "GPT institucional respondeu à pergunta de teste.",
        );
      } else {
        const { data } = await http.put<Configuracao>(
          "/assistente/configuracao",
          {
            ...dados,
            gptAtivo: config.gptAtivo,
            gptInstitucionalAtivo: config.gptInstitucionalAtivo,
          },
        );
        setConfig(data);
        setChave("");
        setGptChave("");
        setMensagem("Configuração salva.");
      }
    } catch (falha) {
      const resposta = isAxiosError<{ message?: unknown }>(falha)
        ? falha.response?.data?.message
        : undefined;
      setErro(
        typeof resposta === "string"
          ? resposta
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setAcao(undefined);
    }
  };

  const salvar = (event: FormEvent) => {
    event.preventDefault();
    void executar("salvar");
  };

  return (
    <>
      <PageHeading
        area="Administração"
        title="Configuração do Vale IA"
        description="Escolha quais provedores podem ser usados no Vale IA."
      />
      <section className="op-panel" aria-label="Provedores do Vale IA">
        {erro && <Alert variant="danger">{erro}</Alert>}
        {mensagem && (
          <Alert variant="success" role="status">
            {mensagem}
          </Alert>
        )}
        {!config && !erro && <p role="status">Carregando configuração…</p>}
        {config && (
          <Form onSubmit={salvar}>
            <h2>ChatGPT</h2>
            <Form.Check
              id="vale-gpt-ativo"
              label="Disponibilizar login pessoal do ChatGPT no Vale IA"
              checked={config.gptAtivo}
              disabled={Boolean(acao)}
              onChange={(event) =>
                setConfig({ ...config, gptAtivo: event.target.checked })
              }
            />
            <p>A conexão com a conta pessoal aguarda liberação da OpenAI.</p>
            <fieldset disabled={Boolean(acao)}>
              <h2>GPT institucional</h2>
              <Form.Group
                controlId="vale-gpt-institucional-chave"
                className="mb-3"
              >
                <Form.Label>Chave da API da OpenAI</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="new-password"
                  maxLength={512}
                  value={gptChave}
                  onChange={(event) => setGptChave(event.target.value)}
                />
                {config.gptCredencialConfigurada && (
                  <Form.Text>
                    Chave cadastrada. Preencha apenas para substituir.
                  </Form.Text>
                )}
              </Form.Group>
              <Form.Group
                controlId="vale-gpt-institucional-modelo"
                className="mb-3"
              >
                <Form.Label>Modelo GPT</Form.Label>
                <Form.Select
                  required
                  value={config.gptModelo}
                  onChange={(event) =>
                    setConfig({ ...config, gptModelo: event.target.value })
                  }
                >
                  {opcoesDeModelo(modelosGpt, config.gptModelo)}
                </Form.Select>
              </Form.Group>
              <Form.Check
                id="vale-gpt-institucional-ativo"
                className="mb-3"
                label="Disponibilizar GPT institucional no Vale IA"
                checked={config.gptInstitucionalAtivo}
                disabled={
                  !config.gptCredencialConfigurada &&
                  !gptChave.trim() &&
                  !config.gptInstitucionalAtivo
                }
                onChange={(event) =>
                  setConfig({
                    ...config,
                    gptInstitucionalAtivo: event.target.checked,
                  })
                }
              />
              <Button
                type="button"
                variant="outline-primary"
                className="mb-3"
                disabled={
                  (!config.gptCredencialConfigurada && !gptChave.trim()) ||
                  !/^gpt-[a-z0-9.-]{2,76}$/.test(config.gptModelo.trim())
                }
                onClick={() => void executar("gpt-institucional")}
              >
                {acao === "gpt-institucional"
                  ? "Testando GPT…"
                  : "Testar conexão GPT"}
              </Button>
            </fieldset>
            <h2>Claude</h2>
            <p>
              {config.credencialConfigurada
                ? "Chave da Anthropic cadastrada."
                : "Cadastre a chave da Anthropic para habilitar Claude."}
            </p>
            <fieldset disabled={Boolean(acao)}>
              <Form.Group controlId="vale-claude-chave" className="mb-3">
                <Form.Label>Chave da API da Anthropic</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="new-password"
                  maxLength={512}
                  value={chave}
                  onChange={(event) => setChave(event.target.value)}
                />
                {config.credencialConfigurada && (
                  <Form.Text>
                    Preencha apenas para substituir a chave cadastrada.
                  </Form.Text>
                )}
              </Form.Group>
              <Form.Group controlId="vale-claude-modelo" className="mb-3">
                <Form.Label>Modelo Claude</Form.Label>
                <Form.Select
                  required
                  value={config.modelo}
                  onChange={(event) =>
                    setConfig({ ...config, modelo: event.target.value })
                  }
                >
                  {opcoesDeModelo(modelosClaude, config.modelo)}
                </Form.Select>
              </Form.Group>
              <Form.Check
                id="vale-claude-ativo"
                className="mb-3"
                label="Disponibilizar Claude no Vale IA"
                checked={config.ativo}
                disabled={
                  !config.credencialConfigurada &&
                  !chave.trim() &&
                  !config.ativo
                }
                onChange={(event) =>
                  setConfig({ ...config, ativo: event.target.checked })
                }
              />
              <div className="d-flex flex-wrap gap-2">
                <Button type="submit">
                  {acao === "salvar" ? "Salvando…" : "Salvar configuração"}
                </Button>
                <Button
                  type="button"
                  variant="outline-primary"
                  disabled={
                    (!config.credencialConfigurada && !chave.trim()) ||
                    !/^claude-[a-z0-9-]{2,73}$/.test(config.modelo.trim())
                  }
                  onClick={() => void executar("claude")}
                >
                  {acao === "claude" ? "Testando…" : "Testar conexão Claude"}
                </Button>
              </div>
            </fieldset>
          </Form>
        )}
      </section>
    </>
  );
}
