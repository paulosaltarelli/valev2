import { useEffect, useState } from "react";
import DataTable from "datatables.net-react";
import DataTablesCore from "datatables.net-bs5";
import "datatables.net-responsive-bs5";
import "datatables.net-dt";
import type { Usuario } from "../../models/UsuariosModel";
import { UsuariosApi } from "../../utils/api/usuariosApi";
import { Button, Form, Modal } from "react-bootstrap";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router";
import { defaultConfig } from "../../utils/datatables/defaultConfig";
import Swal from "sweetalert2";
import { SwalHelper } from "../../utils/swalHelper";
import { Tooltip } from "../../components/Tooltip";
import { FunctionsHelper } from "../../utils/functionsHelper";

// o react-hooks/rules-of-hooks confunde esse método com um Hook por ser `.use`
// eslint-disable-next-line react-hooks/rules-of-hooks
DataTable.use(DataTablesCore);
export function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const navigate = useNavigate();
  const [usuarioToEdit, setUsuarioToEdit] = useState<Usuario | null>(null);
  const [usuarioToCreate, setUsuarioToCreate] = useState<Partial<Usuario>>({
    ativo: true,
    perfil: "admin",
    rm_user_id: "1",
  });

  //Modais
  const [showCreateUsuarioModal, setShowCreateUsuarioModal] = useState(false);
  const [showEditUsuarioModal, setShowEditUsuarioModal] = useState(false);
  useEffect(() => {
    UsuariosApi.getAllUsuarios().then((data) => {
      setUsuarios(data);
    });
  }, []);

  const handleEditUsuario = (usuario: Usuario) => {
    // console.log(`editing usuario ${usuario.usuario_id}`);
    setUsuarioToEdit(usuario);
    setShowEditUsuarioModal(true);
  };
  const handleSaveEditUsuario = () => {
    console.log(`salvando usuario: ${JSON.stringify(usuarioToEdit)}`);
    UsuariosApi.updateById(
      usuarioToEdit?.usuario_id as number,
      usuarioToEdit as Usuario,
    ).then(() => {
      setShowEditUsuarioModal(false);
      handleRefreshUsuarios();
    });
  };
  const handleSaveCreateUsuario = () => {
    console.log(`salvando usuario: ${JSON.stringify(usuarioToCreate)}`);
    UsuariosApi.create(usuarioToCreate as Partial<Usuario>).then(() => {
      setShowCreateUsuarioModal(false);
      handleRefreshUsuarios();

      SwalHelper.toast("Usuário criado com sucesso!", "success");
    });
  };
  const handleDeleteUsuario = (usuario: Usuario) => {
    console.log(`deleting usuario ${usuario.usuario_id}`);
    Swal.fire({
      title: "Excluir o usuário?",
      text: "Tem certeza que deseja excluir o usuário?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sim",
      cancelButtonText: "Não",
    }).then((result) => {
      if (result.isConfirmed) {
        UsuariosApi.deleteById(usuario.usuario_id).then((response) => {
          if (response.status) {
            handleRefreshUsuarios();
            SwalHelper.toast("Usuário excluído com sucesso!", "success");
          } else {
            SwalHelper.toast(response.message, "error");
          }
        });
      }
    });
  };
  const handleRefreshUsuarios = () => {
    UsuariosApi.getAllUsuarios().then((data) => {
      setUsuarios(data);
    });
  };
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
              <h1 className="h4 m-0 p-0">Usuários</h1>
            </div>
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="primary"
                onClick={() => setShowCreateUsuarioModal(true)}
              >
                <Icon icon="tabler:plus" width={20} height={20} />
                <span className="ms-1">Novo Usuário</span>
              </Button>
            </div>
          </div>
          <div className=" p-2 w-100">
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
              }}
              data={usuarios}
              columns={[
                { data: "nome", name: "nome" },
                { data: "login", name: "login" },
                { data: "ativo", name: "ativo" },
                { data: "data_criacao", name: "data_criacao" },
                {
                  data: null,
                  name: "actions",
                  orderable: false,
                  searchable: false,
                },
              ]}
              slots={{
                actions: (row: Usuario) => (
                  <div>
                    <Tooltip title="Editar">
                      <Button
                        variant="outline-primary"
                        className="m-0 px-1 py-1 border-0"
                        onClick={() => handleEditUsuario(row)}
                      >
                        <Icon
                          icon="solar:pen-new-square-bold-duotone"
                          width={20}
                          height={20}
                        />
                      </Button>
                    </Tooltip>

                    <Tooltip title="Excluir">
                      <Button
                        variant="outline-danger"
                        className="m-0 px-1 py-1 border-0"
                        onClick={() => handleDeleteUsuario(row)}
                      >
                        <Icon
                          icon="solar:trash-bin-trash-bold-duotone"
                          width={20}
                          height={20}
                        />
                      </Button>
                    </Tooltip>
                  </div>
                ),
                ativo: (data: boolean) => (
                  <Tooltip title={data ? "Ativo" : "Inativo"}>
                    {data ? (
                      <Icon
                        icon="solar:check-circle-bold-duotone"
                        className="text-success"
                        width={20}
                        height={20}
                      />
                    ) : (
                      <Icon
                        icon="solar:close-circle-bold-duotone"
                        className="text-danger"
                        width={20}
                        height={20}
                      />
                    )}
                  </Tooltip>
                ),
                data_criacao: (data: Date) => (
                  <span>{FunctionsHelper.formatDateTimePtBr(data)}</span>
                ),
              }}
            >
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Código do Usuário</th>
                  <th scope="col">Ativo</th>
                  <th scope="col">Data de Criação</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
            </DataTable>
            {/* <div className="card-body d-flex">
          </div> */}
          </div>
        </div>
      </div>

      <Modal
        show={showEditUsuarioModal}
        onHide={() => setShowEditUsuarioModal(false)}
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Editar Usuário</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <div className="row">
              <div className="col-6 mb-2">
                <Form.Group controlId="nome">
                  <Form.Label>Nome</Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={usuarioToEdit?.nome}
                    onChange={(e) =>
                      setUsuarioToEdit({
                        ...usuarioToEdit,
                        nome: e.target.value,
                      } as Usuario)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="codusuario">
                  <Form.Label>Código do Usuário(RM)</Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={usuarioToEdit?.login}
                    onChange={(e) =>
                      setUsuarioToEdit({
                        ...usuarioToEdit,
                        login: e.target.value,
                      } as Usuario)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group controlId="perfil">
                  <Form.Label>Perfil</Form.Label>
                  <Form.Select
                    size="lg"
                    defaultValue={usuarioToEdit?.perfil}
                    onChange={(e) => {
                      console.log(`perfil: ${e.target.value}`);
                      setUsuarioToEdit({
                        ...usuarioToEdit,
                        perfil: e.target.value,
                      } as Usuario);
                    }}
                  >
                    <option value="admin">Administrador</option>
                    <option value="operator">Operador</option>
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group controlId="ativo">
                  <Form.Label>Ativo</Form.Label>
                  <Form.Check
                    type="switch"
                    defaultChecked={usuarioToEdit?.ativo}
                    onChange={(e) =>
                      setUsuarioToEdit({
                        ...usuarioToEdit,
                        ativo: e.target.checked,
                      } as Usuario)
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
            onClick={() => setShowEditUsuarioModal(false)}
          >
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSaveEditUsuario}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showCreateUsuarioModal}
        onHide={() => setShowCreateUsuarioModal(false)}
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>Criar Usuário</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <div className="row">
              <div className="col-6 mb-2">
                <Form.Group controlId="nome">
                  <Form.Label>Nome</Form.Label>
                  <Form.Control
                    type="text"
                    defaultValue={usuarioToCreate?.nome}
                    onChange={(e) =>
                      setUsuarioToCreate({
                        ...usuarioToCreate,
                        nome: e.target.value,
                      } as Usuario)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-6 mb-2">
                <Form.Group controlId="codusuario">
                  <Form.Label className="d-flex align-items-center gap-1">
                    Código do Usuário(RM)
                    <Tooltip
                      title="O mesmo código do usuário(login) no RM."
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
                    defaultValue={usuarioToCreate?.login}
                    onChange={(e) =>
                      setUsuarioToCreate({
                        ...usuarioToCreate,
                        login: e.target.value,
                      } as Usuario)
                    }
                  />
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group controlId="perfil">
                  <Form.Label>Perfil</Form.Label>
                  <Form.Select
                    size="lg"
                    value={usuarioToCreate?.perfil}
                    onChange={(e) => {
                      console.log(`perfil: ${e.target.value}`);
                      setUsuarioToCreate({
                        ...usuarioToCreate,
                        perfil: e.target.value,
                      } as Usuario);
                    }}
                  >
                    <option value="admin">Administrador</option>
                    <option value="operator">Operador</option>
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-12 mb-2">
                <Form.Group controlId="ativo">
                  <Form.Label>Ativo</Form.Label>
                  <Form.Check
                    type="switch"
                    defaultChecked={usuarioToCreate?.ativo}
                    onChange={(e) =>
                      setUsuarioToCreate({
                        ...usuarioToCreate,
                        ativo: e.target.checked,
                      } as Usuario)
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
            onClick={() => setShowCreateUsuarioModal(false)}
          >
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSaveCreateUsuario}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
