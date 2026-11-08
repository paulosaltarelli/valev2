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
        description={filial?.nome}
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
        }}
        data={variaveis}
        columns={[
          { data: "nome", name: "nome" },
          { data: "codigo", name: "codigo" },
          { data: "tipo", name: "tipo" },
          { data: "sql_codigo_rm", name: "sql_codigo_rm" },
          { data: "valor_fixo", name: "valor_fixo" },
          { data: null, name: "actions", orderable: false, searchable: false },
        ]}
        slots={{
          actions: (row: Variavel) => (
            <div>
              <Button
                variant="outline-primary"
                className="m-0 px-1 py-1 border-0"
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
                className="m-0 px-1 py-1 border-0"
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
            <th>SQL Código RM</th>
            <th>Valor Fixo</th>
            <th>Ações</th>
          </tr>
        </thead>
      </DataTable>
      </div>

      <Modal
        show={showEditVariavelModal}
        onHide={() => setShowEditVariavelModal(false)}
      >
        <Modal.Header closeButton closeLabel="Fechar janela">
          <Modal.Title>Editar Variavel</Modal.Title>
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
              <div className="col-6 mb-2">
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
              <div className="col-6 mb-2">
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
              <div className="col-6 mb-2">
                <Form.Group controlId="sql_codigo_rm">
                  <Form.Label>SQL Código RM</Form.Label>
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
              <div className="col-6 mb-2">
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
          <Button variant="primary" onClick={handleSaveEditVariavel}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={showInsertVariavelModal}
        onHide={() => setShowInsertVariavelModal(false)}
      >
        <Modal.Header closeButton closeLabel="Fechar janela">
          <Modal.Title>Criar Variavel</Modal.Title>
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
              <div className="col-6 mb-2">
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
              <div className="col-6 mb-2">
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
              <div className="col-6 mb-2">
                <Form.Group controlId="new_sql_codigo_rm">
                  <Form.Label>SQL Código RM</Form.Label>
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
              <div className="col-6 mb-2">
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
          <Button variant="primary" onClick={handleInsertVariavel}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
