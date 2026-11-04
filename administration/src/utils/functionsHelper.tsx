import type { ReactNode } from "react";
import { Badge } from "react-bootstrap";
import type { FuncionarioRm } from "../models/FuncionarioRmModel";

export class FunctionsHelper {
  public static getFirstDayOfMonth(date?: Date): Date {
    if (!date) {
      date = new Date();
    }
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  public static getLastDayOfMonth(date?: Date): Date {
    if (!date) {
      date = new Date();
    }
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  public static formatDateOnlyPtBr(dateLike: unknown): string {
    if (!dateLike) return "-";
    const date = new Date(dateLike as string | number | Date);
    if (Number.isNaN(date.getTime())) return "-";

    // O backend normalmente serializa Date como ISO em UTC (ex.: 2025-12-01T00:00:00.000Z).
    // Se formatar no fuso local (America/Sao_Paulo), pode aparecer 1 dia a menos.
    return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }

  public static formatDateTimePtBr(dateLike: unknown): string {
    if (!dateLike) return "-";
    const date = new Date(dateLike as string | number | Date);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }

  public static formatStatusExecucao(status: string): ReactNode {
    switch (status) {
      case "EM_PROCESSAMENTO":
        return <Badge bg="info">Em processamento</Badge>;
      case "AGUARDANDO":
        return <Badge bg="secondary">Aguardando</Badge>;
      case "EM_VALIDACAO":
        return <Badge bg="warning">Em validação</Badge>;
      case "FINALIZADA":
        return <Badge bg="success">Finalizada</Badge>;
      case "CANCELADA":
        return <Badge bg="danger">Cancelada</Badge>;
      default:
        return <Badge bg="secondary">{status}</Badge>;
    }
  }
  public static formatStatusExecucaoFuncionario(status: string): ReactNode {
    switch (status) {
      case "PREVIA":
        return <Badge bg="warning">Pendente</Badge>;
      case "VARIAVEIS_PROCESSADAS":
        return <Badge bg="primary">Variáveis processadas</Badge>;
      case "ERRO_VARIAVEIS":
        return <Badge bg="danger">Erro de variáveis</Badge>;
      case "RESULTADOS_PROCESSADOS":
        return <Badge bg="info">Resultados processados</Badge>;
      case "RESULTADOS_PARCIAL":
        return <Badge bg="warning">Resultados parciais</Badge>;
      case "APROVADO":
        return <Badge bg="info">Aprovado</Badge>;
      case "REPROVADO":
        return <Badge bg="danger">Reprovado</Badge>;
      case "ENVIADO_RM":
        return <Badge bg="success">Enviado para RM</Badge>;
      case "ERRO_RM":
        return <Badge bg="danger">Erro ao enviar para RM</Badge>;
      default:
        return <Badge bg="secondary">{status}</Badge>;
    }
  }

  public static formatEnderecoFuncionario(f: FuncionarioRm): string {
    return `${f.RUA_FUNC}, ${f.NUMERO_FUNC} - ${f.BAIRRO_FUNC}, ${f.CIDADE_FUNC} - ${f.ESTADO_FUNC}, ${f.CEP_FUNC}, Brasil`;
  }

  public static formatEnderecoFilial(f: FuncionarioRm): string {
    return `${f.RUA_FILIAL}, ${f.NUMERO_FILIAL} - ${f.BAIRRO_FILIAL}, ${f.CIDADE_FILIAL} - ${f.ESTADO_FILIAL}, ${f.CEP_FILIAL}, Brasil`;
  }
}
