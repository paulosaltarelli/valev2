import type { ExecFunc } from "./ExecFuncModel";
import type { Variavel } from "./VariavelModel";

export type MemoriaCalculo = {
  memoria_id: number;
  execucao_funcionario_id: number;
  variavel_id: number;
  variavel_codigo: string;
  variavel_nome: string;
  valor: number;
  origem: string;
  detalhe: string;
  data_registro: Date;
  execucao_funcionario?: ExecFunc;
  variavel?: Variavel;
};