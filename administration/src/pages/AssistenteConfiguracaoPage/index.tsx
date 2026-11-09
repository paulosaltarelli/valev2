import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Form } from "react-bootstrap";
import { isAxiosError } from "axios";
import { PageHeading } from "../../shared/components/PageHeading";
import { http } from "../../shared/lib/http";

type Configuracao = {
  ativo: boolean;
  modelo: string;
  credencialConfigurada: boolean;
};

export function AssistenteConfiguracaoPage() {
  const [config, setConfig] = useState<Configuracao>();
  const [acao, setAcao] = useState<"salvar" | "testar">();
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

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

  const executar = async (operacao: "salvar" | "testar") => {
    if (!config || acao) return;
    setAcao(operacao);
    setErro("");
    setMensagem("");
    const dados = { ativo: config.ativo, modelo: config.modelo.trim() };
    try {
      if (operacao === "testar") {
        await http.post("/assistente/configuracao/testar", dados);
        setMensagem("Claude respondeu à pergunta de teste.");
      } else {
        await http.put("/assistente/configuracao", dados);
        setConfig({ ...config, ...dados });
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
        description="Gerencie a conexão institucional com Claude."
      />
      <section className="op-panel" aria-label="Configuração do Claude">
        <h2>Claude</h2>
        {erro && <Alert variant="danger">{erro}</Alert>}
        {mensagem && (
          <Alert variant="success" role="status">
            {mensagem}
          </Alert>
        )}
        {!config && !erro && <p role="status">Carregando configuração…</p>}
        {config && (
          <Form onSubmit={salvar}>
            <p>
              {config.credencialConfigurada
                ? "Credencial institucional disponível no servidor."
                : "Cadastre a credencial institucional nos segredos do servidor para habilitar Claude."}
            </p>
            <fieldset disabled={Boolean(acao)}>
              <Form.Group controlId="vale-claude-modelo" className="mb-3">
                <Form.Label>Identificador do modelo</Form.Label>
                <Form.Control
                  required
                  maxLength={80}
                  pattern="claude-[a-z0-9\-]{2,73}"
                  value={config.modelo}
                  onChange={(event) =>
                    setConfig({ ...config, modelo: event.target.value })
                  }
                />
              </Form.Group>
              <Form.Check
                id="vale-claude-ativo"
                className="mb-3"
                label="Disponibilizar Claude no Vale IA"
                checked={config.ativo}
                disabled={!config.credencialConfigurada && !config.ativo}
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
                    !config.credencialConfigurada ||
                    !/^claude-[a-z0-9-]{2,73}$/.test(config.modelo.trim())
                  }
                  onClick={() => void executar("testar")}
                >
                  {acao === "testar" ? "Testando…" : "Testar conexão"}
                </Button>
              </div>
            </fieldset>
          </Form>
        )}
      </section>
    </>
  );
}
