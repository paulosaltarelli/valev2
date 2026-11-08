import { PageHeading } from "../../shared/components/PageHeading";
import { useEffect, useState, type FormEvent } from "react";
import DataTable from "datatables.net-react";
import DataTablesCore from "datatables.net-bs5";
import "datatables.net-responsive-bs5";
import { PeriodoApi } from "../../utils/api/periodoApi";
import { Icon } from "@iconify/react";
import "datatables.net-dt";

import { Modal } from "../../shared/components/VeModal";
import { Button } from "../../components/utils/Button";
import { defaultConfig } from "../../utils/datatables/defaultConfig";
import { Form } from "react-bootstrap";

import type { Periodo } from "../../models/PeriodoModel";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { SwalHelper } from "../../utils/swalHelper";
import { FunctionsHelper } from "../../utils/functionsHelper";
import Swal from "sweetalert2";
import { useBlockUi } from "../../app/providers/blockUiContext";

// o react-hooks/rules-of-hooks confunde esse método com um Hook por ser `.use`
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DataTablesCore);

export function PeriodoPage() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const { show: blockUiShow, hide: blockUiHide } = useBlockUi();
  useEffect(() => {
    PeriodoApi.getAllPeriodos().then((periodos: Periodo[]) => {
      setPeriodos(periodos);
    });
  }, []);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [periodoToCreate, setPeriodoToCreate] = useState<Partial<Periodo>>({
    data_inicio: FunctionsHelper.getFirstDayOfMonth(),
    data_fim: FunctionsHelper.getLastDayOfMonth(),
  });
  const [periodoToEdit, setPeriodoToEdit] = useState<Periodo | null>(null);
  const [competenciaDate, setCompetenciaDate] = useState<Date>(new Date());

  const formatCompetencia = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());
    return `${month}/${year}`;
  };

  const openCreateModal = () => {
    const now = new Date();
    const firstDayOfMonth = FunctionsHelper.getFirstDayOfMonth(now);
    const lastDayOfMonth = FunctionsHelper.getLastDayOfMonth(now);
    setCompetenciaDate(now);
    setPeriodoToCreate({
      data_inicio: firstDayOfMonth,
      data_fim: lastDayOfMonth,
      competencia: formatCompetencia(now),
    });
    setShowCreateModal(true);
  };

  const parseDateFromInput = (value: string) => {
    if (!value) return undefined;
    // evita shift de timezone ao criar Date a partir de YYYY-MM-DD
    return new Date(`${value}T00:00:00`);
  };

  const isValidDate = (date: Date) => !Number.isNaN(date.getTime());

  const toDateInputValue = (dateLike: unknown) => {
    if (!dateLike) return "";
    const date = new Date(dateLike as string | number | Date);
    if (!isValidDate(date)) return "";
    return date.toISOString().slice(0, 10);
  };

  const parseCompetenciaToDate = (competencia: string | undefined | null) => {
    if (!competencia) return null;

    // formato atual: "MM/yyyy"
    const mmYyyy = /^(\d{2})\/(\d{4})$/.exec(competencia);
    if (mmYyyy) {
      const month = Number(mmYyyy[1]);
      const year = Number(mmYyyy[2]);
      const date = new Date(year, month - 1, 1);
      return isValidDate(date) ? date : null;
    }

    // fallback para valores antigos/ISO (se existirem)
    const date = new Date(competencia);
    return isValidDate(date) ? date : null;
  };

  const handleEditPeriodo = (periodo: Periodo) => {
    console.log(`editando periodo: ${periodo.periodo_id}`);
    setPeriodoToEdit(periodo);
    setShowEditModal(true);
  };

  const handleSaveCreatePeriodo = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log(`salvando periodo: ${JSON.stringify(periodoToCreate)}`); //aqui
    try {
      blockUiShow("Salvando período...");
      const response = await PeriodoApi.insert(periodoToCreate as Periodo);
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        setShowCreateModal(false);
        handleRefreshPeriodos();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (error) {
      console.error(error);
    } finally {
      blockUiHide();
    }
  };
  const handleSaveEditPeriodo = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      blockUiShow("Salvando período...");
      const response = await PeriodoApi.updateById(
        periodoToEdit?.periodo_id as number,
        periodoToEdit as Periodo
      );
      if (response.status) {
        SwalHelper.toast(response.message, "success");
        setShowEditModal(false);
        handleRefreshPeriodos();
      } else {
        SwalHelper.toast(response.message, "error");
      }
    } catch (error) {
      console.error(error);
    } finally {
      blockUiHide();
    }
  };
  const handleDeletePeriodo = async (periodo: Periodo) => {
    console.log(`excluindo periodo: ${periodo.periodo_id}`);
    const result = await Swal.fire({
      title: "Excluir Competência",
      text: "Tem certeza que deseja excluir o período?",
      icon: "warning",
      showDenyButton: true,
      confirmButtonText: "Sim",
      denyButtonText: "Não",
      confirmButtonColor: "#dc3545",
      denyButtonColor: "#6c757d",
    });
    if (result.isConfirmed) {
      try {
        blockUiShow("Excluindo período...");
        const response = await PeriodoApi.deleteById(periodo.periodo_id);
        if (response.status) {
          SwalHelper.toast(response.message, "success");
          handleRefreshPeriodos();
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
  const handleRefreshPeriodos = () => {
    PeriodoApi.getAllPeriodos().then((periodos: Periodo[]) => {
      setPeriodos(periodos);
    });
  };
  const columns = [
    { data: "competencia", name: "competencia" },
    { data: "data_inicio", name: "data_inicio" },
    { data: "data_fim", name: "data_fim" },
    { data: "ativo", name: "ativo" },
    { data: null, name: "actions", orderable: false, searchable: false },
  ];

  return (
    <>
      <PageHeading
        area="Regras e cadastros"
        title="Competências"
        description="Consulte e cadastre as competências usadas em Processamentos."
        actions={(
          <Button
            tooltip="Criar nova competência"
            variant="primary"
            onClick={openCreateModal}
          >
            <Icon icon="tabler:plus" width={20} height={20} />
            <span className="ms-1">Nova competência</span>
          </Button>
        )}
      />
      <div className="card">
        <div className="card-body">
          <div className="ve-table-list">
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
                  },
                ],
                ...defaultConfig,
                order: [[1, "desc"]],
              }}
              data={periodos}
              columns={columns}
              slots={{
                actions: (row: Periodo) => (
                  <div>
                    <Button
                      variant="outline-primary"
                      tooltip="Editar período"
                      className="ve-icon-action"
                      onClick={() => handleEditPeriodo(row)}
                    >
                      <Icon
                        icon="solar:pen-new-square-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                    <Button
                      variant="outline-danger"
                      tooltip="Excluir período"
                      className="ve-icon-action"
                      onClick={() => handleDeletePeriodo(row)}
                    >
                      <Icon
                        icon="solar:trash-bin-trash-bold-duotone"
                        width={20}
                        height={20}
                      />
                    </Button>
                  </div>
                ),
                data_inicio: (data: unknown) => (
                  <span>{FunctionsHelper.formatDateOnlyPtBr(data)}</span>
                ),
                data_fim: (data: unknown) => (
                  <span>{FunctionsHelper.formatDateOnlyPtBr(data)}</span>
                ),
                ativo: (ativo: boolean) => (
                  <span className={`ve-state ${ativo ? "ve-state-active" : ""}`}>{ativo ? "Ativa" : "Encerrada"}</span>
                ),
              }}
            >
              <thead>
                <tr>
                  <th scope="col">Competência</th>
                  <th scope="col">Data Início</th>
                  <th scope="col">Data Fim</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
            </DataTable>
          </div>
        </div>
      </div>
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton closeLabel="Fechar janela">
          <Modal.Title>Editar Competência</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSaveEditPeriodo} id="editPeriodoForm">
            <div className="row">
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="codfilial">
                  <Form.Label>Data Inicial</Form.Label>
                  <Form.Control
                    type="date"
                    value={toDateInputValue(periodoToEdit?.data_inicio)}
                    onChange={(e) => {
                      const parsed = parseDateFromInput(e.target.value);
                      setPeriodoToEdit({
                        ...periodoToEdit,
                        data_inicio: parsed as Date,
                      } as Periodo);
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="codcoligada">
                  <Form.Label>Data Final</Form.Label>
                  <Form.Control
                    type="date"
                    value={toDateInputValue(periodoToEdit?.data_fim)}
                    onChange={(e) => {
                      const parsed = parseDateFromInput(e.target.value);
                      setPeriodoToEdit({
                        ...periodoToEdit,
                        data_fim: parsed as Date,
                      } as Periodo);
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group
                  controlId="competencia"
                  className="d-flex gap-1 flex-column"
                >
                  <Form.Label>Competência</Form.Label>
                  <DatePicker
                    className="form-control"
                    selected={
                      periodoToEdit?.competencia
                        ? parseCompetenciaToDate(periodoToEdit.competencia) ??
                          new Date()
                        : new Date()
                    }
                    onChange={(date: Date | null) => {
                      if (!date) return;
                      setPeriodoToEdit({
                        ...periodoToEdit,
                        data_inicio: FunctionsHelper.getFirstDayOfMonth(date),
                        data_fim: FunctionsHelper.getLastDayOfMonth(date),
                        competencia: formatCompetencia(date),
                      } as Periodo);
                    }}
                    dateFormat="MM/yyyy"
                    showMonthYearPicker
                  />
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group controlId="ativo" className="d-flex align-items-start gap-1 flex-column">
                  <Form.Label>Ativo</Form.Label>
                  <Form.Check
                    type="switch"
                    defaultChecked={periodoToEdit?.ativo}
                    onChange={(e) => {
                      setPeriodoToEdit((prev) => ({
                        ...prev,
                        ativo: e.target.checked,
                      } as Periodo));
                    }}
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
          <Button variant="primary" type="submit" form="editPeriodoForm">
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)}>
        <Modal.Header closeButton closeLabel="Fechar janela">
          <Modal.Title>Cadastrar Competência</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleSaveCreatePeriodo} id="createPeriodoForm">
            <div className="row">
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="codfilial">
                  <Form.Label>Data Inicial</Form.Label>
                  <Form.Control
                    type="date"
                    value={
                      periodoToCreate.data_inicio
                        ? new Date(periodoToCreate.data_inicio)
                            .toISOString()
                            .slice(0, 10)
                        : ""
                    }
                    onChange={(e) => {
                      const parsed = parseDateFromInput(e.target.value);
                      setPeriodoToCreate((prev) => ({
                        ...prev,
                        data_inicio: parsed,
                      }));
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-12 col-sm-6 mb-2">
                <Form.Group controlId="codcoligada">
                  <Form.Label>Data Final</Form.Label>
                  <Form.Control
                    type="date"
                    value={
                      periodoToCreate.data_fim
                        ? new Date(periodoToCreate.data_fim)
                            .toISOString()
                            .slice(0, 10)
                        : ""
                    }
                    onChange={(e) => {
                      const parsed = parseDateFromInput(e.target.value);
                      setPeriodoToCreate((prev) => ({
                        ...prev,
                        data_fim: parsed,
                      }));
                    }}
                  />
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group
                  controlId="competencia"
                  className="d-flex gap-1 flex-column"
                >
                  <Form.Label>Competência</Form.Label>
                  <DatePicker
                    className="form-control"
                    selected={competenciaDate}
                    onChange={(date: Date | null) => {
                      if (!date) return;
                      setCompetenciaDate(date);
                      setPeriodoToCreate((prev) => ({
                        ...prev,
                        data_inicio: FunctionsHelper.getFirstDayOfMonth(date),
                        data_fim: FunctionsHelper.getLastDayOfMonth(date),
                        competencia: formatCompetencia(date),
                      }));
                    }}
                    dateFormat="MM/yyyy"
                    showMonthYearPicker
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
          <Button variant="primary" type="submit" form="createPeriodoForm">
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
