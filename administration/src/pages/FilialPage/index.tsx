import { useEffect, useState } from "react";
import DataTable from "datatables.net-react";
import DataTablesCore from "datatables.net-bs5";
import "datatables.net-responsive-bs5";
import { filialApi } from "../../utils/api/filialApi";
import type { Filial } from "../../models/FilialModel";
import { Icon } from "@iconify/react";
import "datatables.net-dt";

import { Modal } from "react-bootstrap";
import { Button } from "../../components/utils/Button";
import { defaultConfig } from "../../utils/datatables/defaultConfig";
import { useNavigate } from "react-router";
import { Form } from "react-bootstrap";
// import { SwalHelper } from "../../utils/swalHelper";
import Swal from "sweetalert2";
import { SwalHelper } from "../../utils/swalHelper";
import { Tooltip } from "../../components/Tooltip";
import { useBlockUi } from "../../app/providers/blockUiContext";

// o react-hooks/rules-of-hooks confunde esse método com um Hook por ser `.use`
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DataTablesCore);

export function FilialPage() {
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filialToCreate, setFilialToCreate] = useState<Partial<Filial>>({});
  const { show: blockUiShow, hide: blockUiHide } = useBlockUi();
  const navigate = useNavigate();

  const [filialToEdit, setFilialToEdit] = useState<Filial | null>(null);

  const handleEditFilial = (filial: Filial) => {
    console.log(`editando filial: ${filial.filial_id}`);
    setFilialToEdit({
      ...filial,
      formula: undefined,
    }); //tira a formula do objeto
    setShowEditModal(true);
  };
  const handleSaveEditFilial = async () => {
    try {
      blockUiShow("Salvando filial...");
      const response = await filialApi.updateById(
        filialToEdit?.filial_id as number,
        filialToEdit as Partial<Filial>,
      );
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        setShowEditModal(false);
        handleRefreshFiliais();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (error) {
      console.error(error);
    } finally {
      blockUiHide();
    }
  };
  const handleSaveCreateFilial = async () => {
    try {
      blockUiShow("Salvando filial...");
      const response = await filialApi.create(
        filialToCreate as Partial<Filial>,
      );
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        setShowCreateModal(false);
        handleRefreshFiliais();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (error) {
      console.error(error);
    } finally {
      blockUiHide();
    }
  };
  const handleDeleteFilial = async (filial: Filial) => {
    console.log(`excluindo filial: ${filial.filial_id}`);
    const result = await Swal.fire({
      title: "Excluir Filial",
      text: "Tem certeza que deseja excluir a filial?",
      icon: "warning",
      showDenyButton: true,
      confirmButtonText: "Sim",
      denyButtonText: "Não",
      confirmButtonColor: "#dc3545",
      denyButtonColor: "#6c757d",
    });
    if (result.isConfirmed) {
      try {
        blockUiShow("Excluindo filial...");
        const response = await filialApi.removeById(filial.filial_id);
        if (response.status) {
          SwalHelper.toast(response.message, "success");
          setFiliais(filiais.filter((f) => f.filial_id !== filial.filial_id));
          handleRefreshFiliais();
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
  const handleVariaveisFilial = (filialId: number) => {
    navigate(`/filial/variaveis/${filialId}`);
  };
  const handleFormulasFilial = (filialId: number) => {
    navigate(`/filial/formulas/${filialId}`);
  };
  useEffect(() => {
    filialApi.all().then((data) => {
      setFiliais(data);
    });
  }, []);

  const handleRefreshFiliais = () => {
    filialApi.all().then((data) => {
      setFiliais(data);
    });
  };

  const columns = [
    { data: "nome", name: "nome" },
    { data: "codfilial", name: "codfilial" },
    { data: "codcoligada", name: "codcoligada" },
    { data: "sql_codigo_rm", name: "sql_codigo_rm" },
    { data: null, name: "actions", orderable: false, searchable: false },
  ];

  return (
    <>
      <div className="card">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="outline-secondary"
                className="m-0 px-1 py-1 border-0"
                onClick={() => navigate(`/`)}
              >
                <Icon
                  icon="solar:alt-arrow-left-linear"
                  width={20}
                  height={20}
                />
              </Button>
              <div><p className="op-eyebrow">Regras e cadastros</p><h1 className="m-0">Filiais e regras</h1></div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <Button
                tooltip="Criar nova filial"
                variant="primary"
                onClick={() => setShowCreateModal(true)}
              >
                <Icon icon="tabler:plus" width={20} height={20} />
                <span className="ms-1">Nova Filial</span>
              </Button>
            </div>
          </div>
          <div className=" p-2 w-100">
            <DataTable
              className="table striped-table mb-0"
              options={{
                ...defaultConfig,
                pageLength: 10,
                layout: {
                  topStart: null,
                },
                columnDefs: [
                  {
                    targets: ["_all"],
                    className: "text-center",
                  },
                ],
              }}
              data={filiais}
              columns={columns}
              slots={{
                actions: (row: Filial) => (
                  <div>
                    <Button
                      variant="outline-primary"
                      tooltip="Editar filial"
                      className="m-0 px-1 py-1 border-0"
                      onClick={() => handleEditFilial(row)}
                    >
                      <Icon
                        icon="solar:pen-new-square-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                    <Button
                      variant="outline-danger"
                      tooltip="Excluir filial"
                      className="m-0 px-1 py-1 border-0"
                      onClick={() => handleDeleteFilial(row)}
                    >
                      <Icon
                        icon="solar:trash-bin-trash-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                    <Button
                      variant="outline-secondary"
                      tooltip="Variaveis"
                      className="m-0 px-1 py-1 border-0"
                      onClick={() => handleVariaveisFilial(row.filial_id)}
                    >
                      <Icon icon="hugeicons:variable" width={20} height={20} />
                    </Button>
                    <Button
                      variant="outline-info"
                      tooltip="Formulas"
                      className="m-0 px-1 py-1 border-0"
                      onClick={() => handleFormulasFilial(row.filial_id)}
                    >
                      <Icon
                        icon="hugeicons:function-square"
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
                  <th scope="col">Nome</th>
                  <th scope="col">Código da Filial</th>
                  <th scope="col">Código da Coligada</th>
                  <th scope="col">SQL Código RM</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
            </DataTable>
            {/* <div className="card-body d-flex">
          </div> */}
          </div>
        </div>
      </div>
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Editar Filial</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <div className="row">
              <div className="col-12 mb-2">
                <Form.Group controlId="nome_filial">
                  <Form.Label>Nome</Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={filialToEdit?.nome}
                    onChange={(e) =>
                      setFilialToEdit({
                        ...filialToEdit,
                        nome: e.target.value,
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>

              <div className="col-6 mb-2">
                <Form.Group controlId="codfilial">
                  <Form.Label>Código da Filial</Form.Label>
                  <Form.Control
                    type="number"
                    defaultValue={filialToEdit?.codfilial}
                    onChange={(e) =>
                      setFilialToEdit({
                        ...filialToEdit,
                        codfilial: parseInt(e.target.value),
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="codcoligada">
                  <Form.Label>Código da Coligada</Form.Label>
                  <Form.Control
                    type="number"
                    defaultValue={filialToEdit?.codcoligada}
                    onChange={(e) =>
                      setFilialToEdit({
                        ...filialToEdit,
                        codcoligada: parseInt(e.target.value),
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="sql_codigo_rm">
                  <Form.Label className="d-flex align-items-center gap-1 mt-2 mb-1">
                    SQL Código RM
                    <Tooltip
                      title="A sentença(consulta) que trará os funcionários da filial"
                      placement="right"
                    >
                      <Icon
                        icon="solar:question-circle-bold-duotone"
                        width={16}
                        height={16}
                      />
                    </Tooltip>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={filialToEdit?.sql_codigo_rm}
                    onChange={(e) =>
                      setFilialToEdit({
                        ...filialToEdit,
                        sql_codigo_rm: e.target.value,
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="km_max">
                  <Form.Label className="d-flex align-items-center gap-1 mt-2 mb-1">
                    Km Máximo
                    <Tooltip
                      title="Km máximo permitido para o calculo de kilometragem da filial"
                      placement="right"
                    >
                      <Icon
                        icon="solar:question-circle-bold-duotone"
                        width={16}
                        height={16}
                      />
                    </Tooltip>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    defaultValue={filialToEdit?.km_max}
                    onChange={(e) =>
                      setFilialToEdit({
                        ...filialToEdit,
                        km_max: Number(e.target.value),
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSaveEditFilial}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)}>
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Cadastrar Filial</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <div className="row">
              <div className="col-12 mb-2">
                <Form.Group controlId="nome_filial">
                  <Form.Label>Nome</Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={""}
                    onChange={(e) =>
                      setFilialToCreate({
                        ...filialToCreate,
                        nome: e.target.value,
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="codfilial">
                  <Form.Label>Código da Filial</Form.Label>
                  <Form.Control
                    type="number"
                    defaultValue={""}
                    onChange={(e) =>
                      setFilialToCreate({
                        ...filialToCreate,
                        codfilial: parseInt(e.target.value),
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="codcoligada">
                  <Form.Label>Código da Coligada</Form.Label>
                  <Form.Control
                    type="number"
                    defaultValue={""}
                    onChange={(e) =>
                      setFilialToCreate({
                        ...filialToCreate,
                        codcoligada: parseInt(e.target.value),
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="sql_codigo_rm">
                  <Form.Label className="d-flex align-items-center gap-1 mt-2 mb-1">
                    SQL Código RM
                    <Tooltip
                      title="A sentença(consulta) que trará os funcionários da filial"
                      placement="right"
                    >
                      <Icon
                        icon="solar:question-circle-bold-duotone"
                        width={16}
                        height={16}
                      />
                    </Tooltip>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={""}
                    onChange={(e) =>
                      setFilialToCreate({
                        ...filialToCreate,
                        sql_codigo_rm: e.target.value,
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="sql_codigo_rm">
                  <Form.Label className="d-flex align-items-center gap-1 mt-2 mb-1">
                    Km Máximo
                    <Tooltip
                      title="Km máximo permitido para o calculo de kilometragem da filial"
                      placement="right"
                    >
                      <Icon
                        icon="solar:question-circle-bold-duotone"
                        width={16}
                        height={16}
                      />
                    </Tooltip>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    defaultValue={70}
                    onChange={(e) =>
                      setFilialToCreate({
                        ...filialToCreate,
                        km_max: Number(e.target.value),
                      } as Filial)
                    }
                  />
                </Form.Group>
              </div>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSaveCreateFilial}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
