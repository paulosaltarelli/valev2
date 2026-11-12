# Diagnóstico e reparo de vínculos RM — 12/11/2026

## Escopo autorizado
Investigar erros de cálculo e envio, preservar acertos e não duplicar eventos. Validações de negócio permanecem para decisão do operador.

## Resultado verificado às 07h31 (São Paulo)
- Oito ocorrências de cálculo nas competências 07, 08 e 09/2026: pagamento fixo com zero dias recebidos no período anterior. Mantidas integralmente; nenhuma fórmula, memória, valor ou revisão alterada.
- Dezessete funcionários com falha de envio em 09/2026: referências antigas a 68 IDs não encontrados no DataServer atual. Cada ID foi consultado individualmente; consulta completa também confirmou ausência da chave composta de coligada, funcionário, período, evento e tipo. Não foi possível determinar por que deixaram de existir; não se atribuiu causa a uma exclusão sem evidência.
- Backup anterior protegido no servidor. Transação com bloqueio da execução, comparação do estado original e histórico VINCULO_RM_AUSENTE para cada referência reparada.
- Novas prévia e confirmação pelos serviços existentes, restritas aos 17 funcionários. Worker normal realizou os envios; nenhuma gravação direta no RM pelo script.
- Conferência posterior: 102 eventos únicos com valores esperados no RM, sendo 68 novos e 34 preservados. Dezessete funcionários ENVIADO_RM. Sem duplicidades.
- As confirmações dos eventos preservados foram comparadas integralmente, sem novos recibos. Valores, fórmulas, revisões, ajustes e erros de negócio também comparados, sem alteração.
- Treze filas foram temporariamente pausadas para dar passagem ao grupo depois do lote em andamento, e todas retomadas. O lote maior de outros envios continua independente deste reparo.

## Evidência e continuidade
Backup e evidência protegidos: `/opt/valeexpresso/releases/ux-rm-repair-20261112/` (`before.json`, `preserved-before.json`, `queued.json`, `verified.json`, registros de pausa/retomada).
Scripts locais em `auditoria/causas-erros-20261112/`. Não reutilizar o script de reparo indiscriminadamente: ele possui guardas para este recorte específico. O backup é evidência do estado anterior; não restaurar vínculos antigos após novos envios sem conciliar novamente os recibos.
Nenhuma alteração de código da aplicação ou publicação foi necessária: o contrato atual de envio funcionou após o reparo dos vínculos antigos. As proteções contra reenvio e inserções sem confirmação foram preservadas.
