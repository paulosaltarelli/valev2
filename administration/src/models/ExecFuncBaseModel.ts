import type { ExecFunc } from "./ExecFuncModel";

export type ExecFuncBase = {
  execucao_funcionario_base_id: number;
  execucao_id: number;
  funcionario_id_rm: string;
  nome_funcionario: string;
  cargo: string;
  data_admissao: Date;
  data_registro: Date;
  execucao_funcionario?: ExecFunc[];
  status: string;
  km: number | null;
};