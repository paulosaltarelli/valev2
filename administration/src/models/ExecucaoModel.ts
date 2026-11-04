import type { Filial } from "./FilialModel";
import type { Formula } from "./FormulaModel";
import type { Periodo } from "./PeriodoModel";
import type { Usuario } from "./UsuariosModel";
// import type { ExecFunc } from "./ExecFuncModel";
import type { ExecFuncBase } from "./ExecFuncBaseModel";

export type Execucao = {
  execucao_id: number;
  filial_id: number;
  periodo_id: number;
  formula_id: number | null;
  usuario_execucao: number;
  status: string;
  data_execucao: Date;
  filial?: Filial;
  periodo?: Periodo;
  formula?: Formula[];
  usuario?: Usuario;
  execucao_funcionario_base?: ExecFuncBase[];
};

export type UpdateExecucaoPayload = Partial<
  Pick<Execucao, 'status' | 'data_execucao'>
>;