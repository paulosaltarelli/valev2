import type { ExecFuncBase } from "./ExecFuncBaseModel";
import type { Formula } from "./FormulaModel";
import type { MemoriaCalculo } from "./MemoriaCalculoModel";

export type ExecFunc = {
  execucao_funcionario_id: number;
  execucao_id: number;
  funcionario_id_rm: string;
  valor_calculado: number;
  valor_final: number;
  status: string;
  ajuste_manual: boolean;
  execucao_funcionario_base_id: number;
  execucao_funcionario_base?: ExecFuncBase;
  formula: Formula;
  memoria_calculo?: MemoriaCalculo[];
};