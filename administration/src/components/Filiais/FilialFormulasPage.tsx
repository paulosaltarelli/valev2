import { PageHeading } from "../../shared/components/PageHeading";
import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { Modal, Form, Badge } from "react-bootstrap";
import { Button } from "../utils/Button";
import { Link, useParams } from "react-router";
import type { Filial } from "../../models/FilialModel";
import { filialApi } from "../../utils/api/filialApi";
import type { Formula } from "../../models/FormulaModel";
import { FormulaApi } from "../../utils/api/formulaApi";

import DataTable from "datatables.net-react";
import DataTablesCore from "datatables.net-bs5";
import "datatables.net-responsive-bs5";
import "datatables.net-bs5";
import { defaultConfig } from "../../utils/datatables/defaultConfig";
import Swal from "sweetalert2";
import { SwalHelper } from "../../utils/swalHelper";
import type { Variavel } from "../../models/VariavelModel";
import { VariavelApi } from "../../utils/api/variavelApi";
import { FunctionsHelper } from "../../utils/functionsHelper";
import { useBlockUi } from "../../app/providers/blockUiContext";
import { Tooltip } from "../Tooltip";
import { Limited } from "../utils/Limited";
import { Popover } from "../Popover";

// o react-hooks/rules-of-hooks confunde esse método com um Hook por ser `.use`
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DataTablesCore);

export function FilialFormulasPage() {
  const { filialId } = useParams<{ filialId: string }>();
  const [filial, setFilial] = useState<Filial | null>(null);
  const { show: blockUiShow, hide: blockUiHide } = useBlockUi();
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [showEditFormulaModal, setShowEditFormulaModal] = useState(false);
  const [formulaToEdit, setFormulaToEdit] = useState<Formula | undefined>(
    undefined
  );
  const [formulaToInsert, setFormulaToInsert] = useState<Formula | undefined>(
    undefined
  );
  const [showInsertFormulaModal, setShowInsertFormulaModal] = useState(false);

  const [variaveis, setVariaveis] = useState<Variavel[]>([]);

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
    FormulaApi.getByFilialId(parseInt(filialId)).then((data) => {
      // console.log("formulasApi: ", data);
      setFormulas(data);
    });

    VariavelApi.getByFilialId(parseInt(filialId)).then((data) => {
      setVariaveis(data);
    });
  }, [filialId]);

  const handleEditFormula = (formula: Formula) => {
    console.log(`editando formula: ${formula.formula_id}`);
    console.log(`formula: ${JSON.stringify(formula)}`);
    setFormulaToEdit(formula);
    setShowEditFormulaModal(true);
  };
  const handleSaveEditFormula = async () => {
    console.log(`salvando formula: ${JSON.stringify(formulaToEdit)}`);
    try {
      blockUiShow("Salvando formula...");
      const response = await FormulaApi.updateById(
        parseInt(filialId as string),
        formulaToEdit?.formula_id as number,
        formulaToEdit as Formula
      );
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        setShowEditFormulaModal(false);
        handleRefreshFormulas();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (error) {
      console.error(error);
    } finally {
      blockUiHide();
    }
  };
  const handleDeleteFormula = async (formulaId: number) => {
    console.log(`excluindo formula: ${formulaId}`);
    const result = await Swal.fire({
      title: "Excluir a formula?",
      text: "Tem certeza que deseja excluir a formula?",
      icon: "warning",
      showDenyButton: true,
      confirmButtonText: "Sim",
      denyButtonText: "Não",
      confirmButtonColor: "#dc3545",
      denyButtonColor: "#6c757d",
    });
    if (result.isConfirmed) {
      try {
        blockUiShow("Excluindo formula...");
        const response = await FormulaApi.deleteById(
          parseInt(filialId as string),
          formulaId
        );
        if (response.status) {
          SwalHelper.toast(response.message, "success");
          handleRefreshFormulas();
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

  const handleRefreshFormulas = () => {
    if (!filialId) {
      throw new Error("Filial ID is required");
    }
    FormulaApi.getByFilialId(parseInt(filialId)).then((data) => {
      setFormulas(data);
    });
  };

  const handleInsertFormula = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log(`inserindo formula: ${JSON.stringify(formulaToInsert)}`);
    try {
      blockUiShow("Inserindo formula...");
      const response = await FormulaApi.insert(
        parseInt(filialId as string),
        formulaToInsert as Formula
      );
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        setShowInsertFormulaModal(false);
        handleRefreshFormulas();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (error) {
      console.error(error);
    } finally {
      blockUiHide();
    }
  };

  const handleAddVariavelCodigo = (codigo: string) => {
    console.log(`adicionando variavel: ${codigo}`);
    setFormulaToInsert((prev) => {
      console.log(`formulaToInsert: ${prev?.expressao}`);
      const codToAdd = `${prev?.expressao ?? ""}(:${codigo})`;
      console.log(`codToAdd: ${codToAdd}`);
      return {
        ...prev,
        expressao: codToAdd,
      } as Formula;
    });
    //foca no input de expressao
    const expressaoInput = document.querySelector('input[name="expressao"]');
    if (expressaoInput) {
      (expressaoInput as HTMLInputElement).focus();
    }
  };
  const handleAddVariavelCodigoToEditFormula = (codigo: string) => {
    console.log(`adicionando variavel: ${codigo}`);
    setFormulaToEdit((prev) => {
      console.log(`formulaToEdit: ${prev?.expressao}`);
      const codToAdd = `${prev?.expressao ?? ""}(:${codigo})`;
      console.log(`codToAdd: ${codToAdd}`);
      return {
        ...prev,
        expressao: codToAdd,
      } as Formula;
    });
    //foca no input de expressao
    const expressaoInput = document.querySelector('input[name="expressao"]');
    if (expressaoInput) {
      (expressaoInput as HTMLInputElement).focus();
    }
  };

  return (
    <div>
      <Link to="/filial" className="op-back">← Filiais e regras</Link>
      <PageHeading
        area="Regras e cadastros"
        title="Fórmulas"
        description={filial?.nome}
        actions={(
          <Button
          variant="primary"
          onClick={() => {
            setFormulaToInsert(undefined);
            setShowInsertFormulaModal(true);
          }}
        >
          <Icon icon="tabler:plus" width={20} height={20} />
          <span className="ms-1">Nova fórmula</span>
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
        data={formulas}
        columns={[
          { data: "nome", name: "nome" },
          { data: "expressao", name: "expressao" },
          { data: "versao", name: "versao" },
          { data: "ativa", name: "ativa" },
          { data: "data_inicio_vigencia", name: "data_inicio_vigencia" },
          { data: "data_fim_vigencia", name: "data_fim_vigencia" },
          { data: "polaridade", name: "polaridade" },
          { data: "codEvento", name: "codEvento" },
          { data: "tipo", name: "tipo" },
          { data: null, name: "actions", orderable: false, searchable: false },
        ]}
        slots={{
          actions: (row: Formula) => (
            <div>
              <Button
                variant="outline-primary"
                className="m-0 px-1 py-1 border-0"
                onClick={() => handleEditFormula(row)}
                tooltip="Editar formula"
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
                onClick={() => handleDeleteFormula(row.formula_id)}
                tooltip="Excluir formula"
              >
                <Icon
                  icon="solar:trash-bin-trash-bold-duotone"
                  width={20}
                  height={20}
                />
              </Button>
            </div>
          ),
          data_inicio_vigencia: (data: unknown) => (
            <span>{FunctionsHelper.formatDateOnlyPtBr(data)}</span>
          ),
          data_fim_vigencia: (data: unknown) => (
            <span>{FunctionsHelper.formatDateOnlyPtBr(data)}</span>
          ),
          ativa: (data: boolean) => (
            <span>
              {data ? (
                <Icon
                  className="text-success"
                  icon="solar:check-circle-bold-duotone"
                  width={20}
                  height={20}
                />
              ) : (
                <Icon
                  className="text-danger"
                  icon="solar:close-circle-bold-duotone"
                  width={20}
                  height={20}
                />
              )}
            </span>
          ),
          expressao: (data: string) => (
            <>
              <Limited limit={10} popover={false} tooltip={false} trigger="click" placement="right">{data}</Limited>
              {data.length > 10 && (
                <Popover popover={data} placement="right" trigger="click">
                  <Button variant="link" className="m-0 px-1 py-1 border-0">
                    <Icon icon="solar:eye-bold-duotone" width={16} height={16} />
                  </Button>
                </Popover>
              )}
            </>
          ),
          tipo: (data: string) => (
            <Badge bg={data == 'V' ? 'primary' : 'info'}>{data == 'V' ? 'Valor' : 'Dias'}</Badge>
          ),
          codEvento: (data: string) => (
            <span>{data}</span>
          ),
          nome: (data: string) => (
            <Limited
              limit={10}
              tooltip={true}
            >
              {data}
            </Limited>
          ),
          polaridade: (data: string) => (
            <Badge bg={data == '+' ? 'success' : 'danger'}>{data}</Badge>
          ),
        }}
      >
        <thead>
          <tr>
            <th>Nome</th>
            <th>Expressão</th>
            <th>Versão</th>
            <th>Ativa</th>
            <th>Data de Início de Vigência</th>
            <th>Data de Fim de Vigência</th>
            <th>Polaridade</th>
            <th>Código do Evento</th>
            <th>Tipo</th>
            <th>Ações</th>
          </tr>
        </thead>
      </DataTable>
      </div>

      <Modal
        show={showEditFormulaModal}
        onHide={() => setShowEditFormulaModal(false)}
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Editar Formula</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label className="mb-2">Variaveis</Form.Label>

          <div className="d-flex align-items-center flex-wrap gap-2 mb-5">
            {variaveis.map((variavel) => (
              <Button
                key={variavel.variavel_id}
                variant="outline-primary"
                className="m-0 px-1 py-1 border-0 bg-primary bg-opacity-10"
                tooltip={variavel.codigo}
                onClick={() =>
                  handleAddVariavelCodigoToEditFormula(variavel.codigo)
                }
              >
                {variavel.nome.length > 10
                  ? variavel.nome.substring(0, 15) + "..."
                  : variavel.nome}
              </Button>
            ))}
          </div>
          <Form>
            <div className="row">
              <div className="col-12 mb-2">
                {/* <Form.Group controlId="tipo">
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
                </Form.Group> */}
                <Form.Group controlId="nome">
                  <Form.Label>Nome</Form.Label>
                  <Form.Control
                    type="text"
                    value={formulaToEdit?.nome}
                    onChange={(e) =>
                      setFormulaToEdit({
                        ...formulaToEdit,
                        nome: e.target.value,
                      } as Formula)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                {/* <Form.Group controlId="tipo">
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
                </Form.Group> */}
                <Form.Group controlId="expressao">
                  <Form.Label>Expressão</Form.Label>
                  <Form.Control
                    type="text"
                    value={formulaToEdit?.expressao}
                    onChange={(e) =>
                      setFormulaToEdit({
                        ...formulaToEdit,
                        expressao: e.target.value,
                      } as Formula)
                    }
                  />
                </Form.Group>
              </div>
              {/* <div className="col-6 mb-2">
                <Form.Group controlId="codigo">
                  <Form.Label>Código</Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={variavelToEdit?.codigo}
                    onChange={(e) =>
                      setVariavelToEdit({
                        ...variavelToEdit,
                        codigo: e.target.value,
                      } as Variavel)
                    }
                  />
                </Form.Group>
              </div> */}
              <div className="col-6 mb-2">
                <Form.Group controlId="data_inicio_vigencia">
                  <Form.Label>Data de Início de Vigência</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    defaultValue={
                      formulaToEdit?.data_inicio_vigencia
                        ? new Date(formulaToEdit.data_inicio_vigencia)
                            .toISOString()
                            .split("T")[0]
                        : ""
                    }
                    onChange={(e) =>
                      setFormulaToEdit({
                        ...formulaToEdit,
                        data_inicio_vigencia: new Date(e.target.value),
                      } as Formula)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="data_inicio_vigencia">
                  <Form.Label>Data de Fim de Vigência</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    defaultValue={
                      formulaToEdit?.data_fim_vigencia
                        ? new Date(formulaToEdit.data_fim_vigencia)
                            .toISOString()
                            .split("T")[0]
                        : ""
                    }
                    onChange={(e) =>
                      setFormulaToEdit({
                        ...formulaToEdit,
                        data_fim_vigencia: new Date(e.target.value),
                      } as Formula)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="codEvento">
                  <Form.Label>Evento RM <Tooltip title="codEvento do metadados do RM"><Icon icon="solar:question-circle-bold-duotone" width={16} height={16} /></Tooltip></Form.Label>
                  <Form.Control
                    type="text"
                    value={formulaToEdit?.codEvento ?? ""}
                    onChange={(e) =>
                      setFormulaToEdit({
                        ...formulaToEdit,
                        codEvento: e.target.value,
                      } as Formula)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="tipo">
                  <Form.Label>Tipo de dado <Tooltip title="Dias ou Valor"><Icon icon="solar:question-circle-bold-duotone" width={16} height={16} /></Tooltip></Form.Label>
                  <Form.Select
                    value={formulaToEdit?.tipo ?? ""}
                    onChange={(e) =>
                      setFormulaToEdit({
                        ...formulaToEdit,
                        tipo: e.target.value,
                      } as Formula)
                    }
                  >
                    <option value="" disabled>
                      Selecione
                    </option>
                    <option value="D">Dias</option>
                    <option value="V">Valor</option>
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group controlId="polaridade">
                  <Form.Label>Polaridade</Form.Label>
                  <Form.Select
                    value={formulaToEdit?.polaridade ?? ""}
                    onChange={(e) =>
                      setFormulaToEdit({
                        ...formulaToEdit,
                        polaridade: e.target.value,
                      } as Formula)
                    }
                  >
                    <option value="+">+</option>
                    <option value="-">-</option>
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group controlId="ativa">
                  <Form.Label>Ativa</Form.Label>
                  <Form.Switch
                    defaultChecked={formulaToEdit?.ativa ?? true}
                    onChange={(e) =>
                      setFormulaToEdit({
                        ...formulaToEdit,
                        ativa: e.target.checked,
                      } as Formula)
                    }
                  />
                </Form.Group>
              </div>
              
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowEditFormulaModal(false)}
          >
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSaveEditFormula}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={showInsertFormulaModal}
        onHide={() => {
          setShowInsertFormulaModal(false);
          setFormulaToInsert(undefined);
        }}
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Criar Formula</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Itera pelas variaveis e cria um botãozinho badge para cada uma com seunome e valor. */}
          <Form.Label className="mb-2">Variaveis</Form.Label>

          <div className="d-flex align-items-center flex-wrap gap-2 mb-5">
            {variaveis.map((variavel) => (
              <Button
                key={variavel.variavel_id}
                variant="outline-primary"
                className="m-0 px-1 py-1 border-0 bg-primary bg-opacity-10"
                tooltip={variavel.codigo}
                onClick={() => handleAddVariavelCodigo(variavel.codigo)}
              >
                {variavel.nome.length > 10
                  ? variavel.nome.substring(0, 15) + "..."
                  : variavel.nome}
              </Button>
            ))}
          </div>
          <Form id="createFormulaForm" onSubmit={handleInsertFormula}>
            <div className="row">
              <div className="col-12 mb-2">
                <Form.Group controlId="nome">
                  <Form.Label>Nome</Form.Label>
                  <Form.Control
                    type="text"
                    required
                    value={formulaToInsert?.nome ?? ""}
                    onChange={(e) =>
                      setFormulaToInsert(
                        (prev) =>
                          ({
                            ...prev,
                            nome: e.target.value,
                          } as Formula)
                      )
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group controlId="expressao">
                  <Form.Label>Expressão</Form.Label>
                  <Form.Control
                    type="text"
                    required
                    value={formulaToInsert?.expressao ?? ""}
                    onChange={(e) =>
                      setFormulaToInsert(
                        (prev) =>
                          ({
                            ...prev,
                            expressao: e.target.value,
                          } as Formula)
                      )
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="data_inicio_vigencia">
                  <Form.Label>Data de Início de Vigência</Form.Label>
                  <Form.Control
                    type="date"
                    required
                    onChange={(e) =>
                      setFormulaToInsert(
                        (prev) =>
                          ({
                            ...prev,
                            data_inicio_vigencia: new Date(e.target.value),
                          } as Formula)
                      )
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="data_inicio_vigencia">
                  <Form.Label>Data de Fim de Vigência</Form.Label>
                  <Form.Control
                    type="date"
                    onChange={(e) =>
                      setFormulaToInsert(
                        (prev) =>
                          ({
                            ...prev,
                            data_fim_vigencia: new Date(e.target.value),
                          } as Formula)
                      )
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="codEvento">
                  <Form.Label>Evento RM <Tooltip title="codEvento do metadados do RM"><Icon icon="solar:question-circle-bold-duotone" width={16} height={16} /></Tooltip></Form.Label>
                  <Form.Control
                    type="text"
                    value={formulaToInsert?.codEvento ?? ""}
                    onChange={(e) =>
                      setFormulaToInsert(
                        (prev) =>
                          ({
                            ...prev,
                            codEvento: e.target.value,
                          } as Formula)
                      )
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="tipo">
                  <Form.Label>Tipo de dado <Tooltip title="Dias ou Valor"><Icon icon="solar:question-circle-bold-duotone" width={16} height={16} /></Tooltip></Form.Label>
                  <Form.Select
                    defaultValue={formulaToInsert?.tipo ?? ""}
                    value={formulaToInsert?.tipo ?? ""}
                    onChange={(e) =>
                      setFormulaToInsert(
                        (prev) =>
                          ({
                            ...prev,
                            tipo: e.target.value,
                          } as Formula)
                      )
                    }
                  >
                    <option value="" disabled selected>Selecione</option>
                    <option value="D">Dias</option>
                    <option value="V">Valor</option>
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group controlId="polaridade">
                  <Form.Label>Polaridade</Form.Label>
                  <Form.Select
                    value={formulaToInsert?.polaridade ?? ""}
                    onChange={(e) =>
                      setFormulaToInsert({
                        ...formulaToInsert,
                        polaridade: e.target.value,
                      } as Formula)
                    }
                  >
                    <option value="+">+</option>
                    <option value="-">-</option>
                  </Form.Select>
                </Form.Group>
              </div>
              {/* <div className="col-12 mb-2">
                <Form.Group controlId="ativa">
                  <Form.Label>Ativa</Form.Label>
                  <Form.Switch
                    defaultChecked={formulaToEdit?.ativa}
                    onChange={(e) =>
                      setFormulaToEdit({
                        ...formulaToEdit,
                        ativa: e.target.checked,
                      } as Formula)
                    }
                  />
                </Form.Group>
              </div> */}
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              setShowInsertFormulaModal(false);
              setFormulaToInsert(undefined);
            }}
          >
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="createFormulaForm">
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
