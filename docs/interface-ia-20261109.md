# Interface do Vale IA — 09/11/2026

Escopo: design e usabilidade. Alterados apenas design-system.css (seletores vale-ia) e o avatar público vale-ia-transporte.svg. Nenhuma alteração no componente funcional AssistenteVale, APIs, prompts, provedores, exportações, estado ou permissões.

Avatar: caminhão de transporte de cargas em SVG, com cores do sistema e símbolo discreto de assistência. Usado no atalho e cabeçalho. O desenho anterior permanece no componente de origem, mas não é exibido nesses pontos; a apresentação é controlada pelo CSS de UX.

Conversa: retirada a lateral duplicada de identidade/contas; essas informações permanecem na aba Contexto e acessos. Janela com largura máxima de 960px, conversa em coluna única, sem cartões aninhados e com campo de mensagem fixo. Uma área de rolagem vertical por aba, com tabelas rolando apenas horizontalmente quando necessário. No celular, tela inteira e campo de mensagem com fonte de 16px. Atalho reduzido, sem subtítulo duplicado.

Referência visual: tokens e cores de Processamentos, bordas discretas, foco visível, abas compactas, contraste de temas claro/escuro. Marca corporativa do sistema preservada; o avatar é uma ilustração do assistente, não substitui o logotipo.

Publicação preparada sobre a fonte de produção com guardas de hashes e sem alterar arquivos funcionais do outro agente. Backup da release iaui-20261109 em /opt/valeexpresso/releases/iaui-20261109/backup; imagem anterior valeexpresso-web:before-iaui-20261109. Reversão: restaurar CSS e imagem anterior, recriando somente web. O SVG adicional pode permanecer sem referência. Considerar publicações posteriores antes de restaurar a imagem inteira.

Estado desta entrega: build TypeScript/Vite concluído. Publicação não executada: revisão automática solicitou autorização explícita para a publicação desta alteração da IA. Backup será criado pelo script antes da troca de imagem, após autorização. Validação visual da versão nova no navegador permanece pendente; inspeção da versão atual concluída.

Atualização após autorização: release iaui-20261109 publicada com backup. Verificadas conversa e contexto, avatar de caminhão, responsividade em 1366×900 e 390×844, tema escuro e uma única área vertical de rolagem no diálogo móvel. Ajuste adicional impede quebra do botão Enviar (release iafix-20261109, backup incremental próprio). Nenhuma mensagem de teste foi enviada ao modelo; validação funcional restrita à navegação da interface. Contêiner da API permaneceu inalterado.
