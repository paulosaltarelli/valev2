import { VisualSummary } from "../../shared/components/VisualSummary";
import { PageHeading } from "../../shared/components/PageHeading";
import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { Modal } from "../../shared/components/VeModal";
import { Link, useParams } from "react-router";
import type { Filial } from "../../models/FilialModel";
import { filialApi } from "../../utils/api/filialApi";
import { VariavelApi } from "../../utils/api/variavelApi";
import type { Variavel } from "../../models/VariavelModel";

import DataTable from "datatables.net-react";
import DataTablesCore from "datatables.net-bs5";
import "datatables.net-responsive-bs5";
import "datatables.net-bs5";
import { defaultConfig } from "../../utils/datatables/defaultConfig";
import Swal from "sweetalert2";
import { SwalHelper } from "../../utils/swalHelper";
import { useBlockUi } from "../../app/providers/blockUiContext";
import { sanitizeCodigo } from "../../utils/sanitizeCodigo";

// o react-hooks/rules-of-hooks confunde esse método com um Hook por ser `.use`
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DataTablesCore);

function tamanhoPacoteInvalido(valor: number | null | undefined) {
  return valor != null && (!Number.isInteger(valor) || valor < 1 || valor > 2147483647);
}

type CampoChapasPorChamadaProps = {
  id: string;
  valor?: number | null;
  onChange: (valor: number | null) => void;
};

function CampoChapasPorChamada({ id, valor, onChange }: CampoChapasPorChamadaProps) {
  return (
    <Form.Group className="col-12 mb-2" controlId={id}>
      <Form.Label>Chapas por chamada ao RM</Form.Label>
      <Form.Control
        type="number"
        min={1}
        max={2147483647}
        step={1}
        placeholder="Sem limite"
        value={valor ?? ""}
        isInvalid={tamanhoPacoteInvalido(valor)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        aria-describedby={id + "_ajuda"}
      />
      <Form.Control.Feedback type="invalid">Informe um número inteiro positivo.</Form.Control.Feedback>
      <Form.Text id={id + "_ajuda"}>Deixe em branco para consultar todas as chapas juntas.</Form.Text>
    </Form.Group>
  );
}

export function FilialVariaveisPage() {
  const { filialId } = useParams<{ filialId: string }>();
  const { show: blockUiShow, hide: blockUiHide } = useBlockUi();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [variaveis, setVariaveis] = useState<Variavel[]>([]);
  const [showEditVariavelModal, setShowEditVariavelModal] = useState(false);
  const [variavelToEdit, setVariavelToEdit] = useState<Variavel | undefined>(
    undefined
  );

  const [variavelToInsert, setVariavelToInsert] = useState<
    Variavel | undefined
  >(undefined);
  const [showInsertVariavelModal, setShowInsertVariavelModal] = useState(false);

  const handleInsertVariavel = async () => {
    console.log(`inserindo variavel: ${JSON.stringify(variavelToInsert)}`);
    if (!variavelToInsert || !filialId) {
      throw new Error("Variavel to insert is required");
    }
    const variavelToInsertCopy: Variavel = { ...variavelToInsert };
    if (!variavelToInsertCopy.sql_codigo_rm?.startsWith("PVE2.")) {
      variavelToInsertCopy.chapas_por_chamada = null;
    }
    variavelToInsertCopy.codigo = sanitizeCodigo(variavelToInsertCopy.codigo);
    if (!variavelToInsertCopy.tipo) {
      variavelToInsertCopy.tipo = "string";
    }

    try {
      blockUiShow("Inserindo variavel...");
      const response = await VariavelApi.insert(
        parseInt(filialId as string),
        variavelToInsertCopy as Variavel
      );
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        setShowInsertVariavelModal(false);
        handleRefreshVariaveis();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (error) {
      console.error(error);
    } finally {
      blockUiHide();
    }
  };

  useEffect(() => {
    if (!filialId) {
      throw new Error("Filial ID is required");
    }
    filialApi.getById(parseInt(filialId)).then((data) => {
      setFilial(data);
    });
  }, [filialId]);

  useEffect(() => {
    if (!filialId) {
      throw new Error("Filial ID is required");
    }
    VariavelApi.getByFilialId(parseInt(filialId)).then((data) => {
      console.log("variaveisApi: ", data);
      setVariaveis(data);
    });
  }, [filialId]);

  const handleEditVariavel = (variavel: Variavel) => {
    console.log(`editando variavel: ${variavel.variavel_id}`);
    console.log(`variavel: ${JSON.stringify(variavel)}`);
    setVariavelToEdit(variavel);
    setShowEditVariavelModal(true);
  };
  const handleSaveEditVariavel = async () => {
    console.log(`salvando variavel: ${JSON.stringify(variavelToEdit)}`);
    try {
      blockUiShow("Salvando variavel...");
      const variavelToEditCopy: Variavel = {
        ...(variavelToEdit as Variavel),
        codigo: sanitizeCodigo(variavelToEdit?.codigo ?? ""),
      };
      if (!variavelToEditCopy.sql_codigo_rm?.startsWith("PVE2.")) {
        variavelToEditCopy.chapas_por_chamada = null;
      }
      const response = await VariavelApi.updateById(
        variavelToEditCopy.variavel_id as number,
        variavelToEditCopy as Variavel
      );
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        setShowEditVariavelModal(false);
        handleRefreshVariaveis();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (error) {
      console.error(error);
    } finally {
      blockUiHide();
    }
  };
  const handleDeleteVariavel = async (variavelId: number) => {
    console.log(`excluindo variavel: ${variavelId}`);
    const result = await Swal.fire({
      title: "Excluir a variável?",
      text: "Tem certeza que deseja excluir a variável?",
      icon: "warning",
      showDenyButton: true,
      confirmButtonText: "Sim",
      denyButtonText: "Não",
      confirmButtonColor: "#dc3545",
      denyButtonColor: "#6c757d",
    });
    if (result.isConfirmed) {
      try {
        blockUiShow("Excluindo variavel...");
        const response = await VariavelApi.deleteById(variavelId);
        if (response.status) {
          SwalHelper.toast(response.message, "success");
          handleRefreshVariaveis();
        } else {
          SwalHelper.toast(response.message, "error");
        }
      } catch (error) {
        console.error(error);
      } finally {
        blockUiHide();
      }
    }
  };

  const handleRefreshVariaveis = () => {
    if (!filialId) {
      throw new Error("Filial ID is required");
    }
    VariavelApi.getByFilialId(parseInt(filialId)).then((data) => {
      setVariaveis(data);
    });
  };

  return (
    <div>
      <Link to="/filial" className="op-back">← Filiais e regras</Link>
      <PageHeading
        area="Regras e cadastros"
        title="Variáveis"
        context={filial?.nome}
        actions={(
          <Button
          variant="primary"
          onClick={() => setShowInsertVariavelModal(true)}
        >
          <Icon icon="tabler:plus" width={20} height={20} />
          <span className="ms-1">Nova variável</span>
        </Button>
        )}
      />
      {!!variaveis.length && <VisualSummary items={[
{label:"Variáveis",value:variaveis.length,icon:"tabler:variable"},
{label:"Consulta RM",value:variaveis.filter(item=>!!item.sql_codigo_rm).length,icon:"tabler:database"},
{label:"Valor fixo",value:variaveis.filter(item=>!item.sql_codigo_rm && item.valor_fixo != null).length,icon:"tabler:pin",tone:"success"}
]} />}
      <div className="card card-body ve-table-list">
      <DataTable
        className="table striped-table mb-0"
        options={{
          pageLength: 10,
          layout: {
            topStart: null,
          },
          columnDefs: [
            {
              targets: ["_all"],
              className: "text-center",
              render: (data: unknown) => {
                if (data === null) {
                  return "<span className='text-muted'>-</span>";
                }
                return data;
              },
            },
          ],
          ...defaultConfig,
                responsive: false,
        }}
        data={variaveis}
        columns={[
          { data: "nome", name: "nome" },
          { data: "codigo", name: "codigo" },
          { data: "tipo", name: "tipo" },
          { data: "sql_codigo_rm", name: "sql_codigo_rm" },
          { data: "chapas_por_chamada", name: "chapas_por_chamada", defaultContent: "Sem limite" },
          { data: "valor_fixo", name: "valor_fixo" },
          { data: null, name: "actions", orderable: false, searchable: false },
        ]}
        slots={{
          actions: (row: Variavel) => (
            <div>
              <Button
                variant="outline-primary"
                aria-label="Editar variável"
                title="Editar variável"
                className="ve-icon-action"
                onClick={() => handleEditVariavel(row)}
              >
                <Icon
                  icon="solar:pen-new-square-bold-duotone"
                  width={20}
                  height={20}
                />
              </Button>
              <Button
                variant="outline-danger"
                aria-label="Excluir variável"
                title="Excluir variável"
                className="ve-icon-action"
                onClick={() => handleDeleteVariavel(row.variavel_id)}
              >
                <Icon
                  icon="solar:trash-bin-trash-bold-duotone"
                  width={20}
                  height={20}
                />
              </Button>
            </div>
          ),
        }}
      >
        <thead>
          <tr>
            <th>Nome</th>
            <th>Código</th>
            <th>Tipo</th>
            <th>Consulta RM</th>
            <th>Chapas por chamada</th>
            <th>Valor Fixo</th>
            <th>Ações</th>
          </tr>
        </thead>
      </DataTable>
      </div>

      <Modal className="ve-editor-modal"
        show={showEditVariavelModal}
        onHide={() => setShowEditVariavelModal(false)}
      >
        <Modal.Header closeButton closeLabel="Fechar janela">
          <Modal.Title>Editar variável</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <div className="row">
              <div className="col-12 mb-2">
                <Form.Group controlId="tipo">
                  <Form.Label>Tipo</Form.Label>
                  <Form.Select
                    size="lg"
                    defaultValue={variavelToEdit?.tipo}
                    onChange={(e) =>
                      setVariavelToEdit({
                        ...variavelToEdit,
                        tipo: e.target.value,
                      } as Variavel)
                    }
                  >
                    <option value="string">Texto</option>
                    <option value="number">Numero</option>
                    <option value="boolean">Sim ou Não</option>
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="nome_variavel">
                  <Form.Label>Nome</Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={variavelToEdit?.nome}
                    onChange={(e) =>
                      setVariavelToEdit({
                        ...variavelToEdit,
                        nome: e.target.value,
                      } as Variavel)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="codigo">
                  <Form.Label>Código</Form.Label>
                  <Form.Control
                    type="text"
                    value={variavelToEdit?.codigo ?? ""}
                    onChange={(e) => {
                      const codigo = sanitizeCodigo(e.target.value);
                      setVariavelToEdit((prev) => {
                        if (!prev) return prev;
                        return { ...prev, codigo };
                      });
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="sql_codigo_rm">
                  <Form.Label>Consulta RM</Form.Label>
                  <Form.Control
                    type="text"
                    value={variavelToEdit?.sql_codigo_rm ?? ""}
                    // disabled={Boolean(variavelToEdit?.valor_fixo)}
                    onChange={(e) => {
                      const sql = e.target.value;
                      setVariavelToEdit((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          sql_codigo_rm: sql,
                          // se começou a preencher SQL, limpa valor fixo
                          valor_fixo: sql.trim() ? null : prev.valor_fixo,
                        };
                      });
                    }}
                  />
                </Form.Group>
              </div>
              {variavelToEdit?.sql_codigo_rm?.startsWith("PVE2.") && (
                <CampoChapasPorChamada
                  id="chapas_por_chamada"
                  valor={variavelToEdit.chapas_por_chamada}
                  onChange={(valor) => setVariavelToEdit((prev) =>
                    prev ? { ...prev, chapas_por_chamada: valor } : prev
                  )}
                />
              )}
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="valor_fixo">
                  <Form.Label>Valor Fixo</Form.Label>
                  <Form.Control
                    type="number"
                    value={
                      variavelToEdit?.valor_fixo === null ||
                      variavelToEdit?.valor_fixo === undefined
                        ? ""
                        : variavelToEdit.valor_fixo
                    }
                    // disabled={
                    //   variavelToEdit?.tipo === "string" ||
                    //   Boolean(variavelToEdit?.sql_codigo_rm?.trim())
                    // }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const valor = raw === "" ? null : Number(raw);
                      setVariavelToEdit((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          valor_fixo: Number.isFinite(valor as number)
                            ? valor
                            : null,
                          // se começou a preencher valor fixo, limpa SQL
                          sql_codigo_rm:
                            valor !== null ? null : prev.sql_codigo_rm,
                        };
                      });
                    }}
                  />
                </Form.Group>
              </div>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowEditVariavelModal(false)}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveEditVariavel}
            disabled={Boolean(variavelToEdit?.sql_codigo_rm?.startsWith("PVE2.")) &&
              tamanhoPacoteInvalido(variavelToEdit?.chapas_por_chamada)}
          >
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal className="ve-editor-modal"
        show={showInsertVariavelModal}
        onHide={() => setShowInsertVariavelModal(false)}
      >
        <Modal.Header closeButton closeLabel="Fechar janela">
          <Modal.Title>Nova variável</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <div className="row">
              <div className="col-12 mb-2">
                <Form.Group controlId="new_tipo">
                  <Form.Label>Tipo</Form.Label>
                  <Form.Select
                    size="lg"
                    value={variavelToInsert?.tipo ?? "number"}
                    onChange={(e) => {
                      console.log(`tipo: ${e.target.value}`);
                      setVariavelToInsert({
                        ...variavelToInsert,
                        tipo: e.target.value,
                      } as Variavel);
                    }}
                  >
                    <option value="string">Texto</option>
                    <option value="number">Numero</option>
                    <option value="boolean">Sim ou Não</option>
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="new_nome_variavel">
                  <Form.Label>Nome</Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={variavelToInsert?.nome}
                    onChange={(e) =>
                      setVariavelToInsert({
                        ...variavelToInsert,
                        nome: e.target.value,
                      } as Variavel)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="new_codigo">
                  <Form.Label>Código</Form.Label>
                  <Form.Control
                    type="text"
                    value={variavelToInsert?.codigo ?? ""}
                    onChange={(e) => {
                      const codigo = sanitizeCodigo(e.target.value);
                      setVariavelToInsert((prev) => {
                        return {
                          ...(prev ?? ({} as Variavel)),
                          codigo,
                        } as Variavel;
                      });
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="new_sql_codigo_rm">
                  <Form.Label>Consulta RM</Form.Label>
                  <Form.Control
                    type="text"
                    value={variavelToInsert?.sql_codigo_rm ?? ""}
                    // disabled={Boolean(variavelToEdit?.valor_fixo)}
                    onChange={(e) => {
                      const sql = e.target.value;
                      setVariavelToInsert((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          sql_codigo_rm: sql,
                          // se começou a preencher SQL, limpa valor fixo
                          valor_fixo: sql.trim() ? null : prev.valor_fixo,
                        };
                      });
                    }}
                  />
                </Form.Group>
              </div>
              {variavelToInsert?.sql_codigo_rm?.startsWith("PVE2.") && (
                <CampoChapasPorChamada
                  id="new_chapas_por_chamada"
                  valor={variavelToInsert.chapas_por_chamada}
                  onChange={(valor) => setVariavelToInsert((prev) =>
                    prev ? { ...prev, chapas_por_chamada: valor } : prev
                  )}
                />
              )}
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="new_valor_fixo">
                  <Form.Label>Valor Fixo</Form.Label>
                  <Form.Control
                    type="number"
                    value={
                      variavelToInsert?.valor_fixo === null ||
                      variavelToInsert?.valor_fixo === undefined
                        ? ""
                        : variavelToInsert?.valor_fixo
                    }
                    // disabled={
                    //   variavelToInsert?.tipo === "string" ||
                    //   Boolean(variavelToInsert?.sql_codigo_rm?.trim())
                    // }
                    onChange={(e) => {
                      const raw = e.target.value;
                      const valor = raw === "" ? null : Number(raw);
                      setVariavelToInsert((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          valor_fixo: Number.isFinite(valor as number)
                            ? valor
                            : null,
                          // se começou a preencher valor fixo, limpa SQL
                          sql_codigo_rm:
                            valor !== null ? null : prev.sql_codigo_rm,
                        };
                      });
                    }}
                  />
                </Form.Group>
              </div>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowInsertVariavelModal(false)}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleInsertVariavel}
            disabled={Boolean(variavelToInsert?.sql_codigo_rm?.startsWith("PVE2.")) &&
              tamanhoPacoteInvalido(variavelToInsert?.chapas_por_chamada)}
          >
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
