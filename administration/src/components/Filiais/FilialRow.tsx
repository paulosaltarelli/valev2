import { Button } from "react-bootstrap";
import type { Filial } from "../../models/FilialModel";
import { useNavigate } from "react-router";
import { Icon } from "@iconify/react";
import { Tooltip } from "../Tooltip";
import { filialApi } from "../../utils/api/filialApi";

export function FilialRow({ filial }: { filial: Filial }) {
  const navigate = useNavigate();
  const handleDeleteFilial = (filialId: number) => {
    filialApi.removeById(filialId).then(() => {
      navigate(`/filial`);
    });
  };
  const handleEditFilial = (filialId: number) => {
    navigate(`/filial/editar/${filialId}`);
  };
  return (
    <div className="card-body d-flex justify-content-between align-items-center gap-2 w-100">
      <div>{filial.nome}</div>
      <div>{filial.codfilial}</div>
      <div>{filial.codcoligada}</div>

      <div className="d-flex align-items-center gap-2">
        <Tooltip key={`excluir-tooltip-${filial.filial_id}`} title="Excluir">
          <Button variant="outline-danger" className="m-0 px-1 py-1 border-0" onClick={() => handleDeleteFilial(filial.filial_id)}>
            <Icon
              icon="solar:trash-bin-trash-bold-duotone"
              width={20}
              height={20}
            />
          </Button>
        </Tooltip>
        <Tooltip key={`editar-tooltip-${filial.filial_id}`} title="Editar">
          <Button variant="outline-primary" className="m-0 px-1 py-1 border-0" onClick={() => handleEditFilial(filial.filial_id)}>
            <Icon
              icon="solar:pen-new-square-bold-duotone"
              width={20}
              height={20}
            />
          </Button>
        </Tooltip>
        <Tooltip
          key={`variaveis-tooltip-${filial.filial_id}`}
          title="Variaveis"
        >
          <Button variant="outline-secondary" className="m-0 px-1 py-1 border-0" onClick={() => navigate(`/filial/variaveis/${filial.filial_id}`)}>
            <Icon icon="hugeicons:variable" width={20} height={20} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
