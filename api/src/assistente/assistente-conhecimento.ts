import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Arquivo = { path: string; text: string; sha256: string };
type Pacote = { generatedAt: string; revision: string; files: Arquivo[] };

const guia = `O Vale Expresso possui competências ativas, filiais, funcionários, fórmulas e variáveis.
Processamentos organiza uma execução por filial e competência, funcionários importados, cálculo de variáveis, fórmulas e envio registrado.
Filas de criação, processamento e geolocalização são etapas diferentes. Resultados podem ser parciais.
Gestão de KM acompanha distâncias e registros existentes. Fechamento reúne pendências. Variação compara competências.
Relatórios usa os dados existentes. Valor calculado, ajuste manual, final local e envio registrado são etapas diferentes.
O operador consulta operação e relatórios. O administrador gerencia usuários, filiais, fórmulas e configurações.
O Vale IA gera SELECTs de leitura sobre visões autorizadas, com validação no servidor e conexões de banco restritas por perfil.
O chat produz relatórios HTML e Excel, e usa a competência ativa. Rankings de filiais consultam as filiais do recorte, mesmo se a tela tiver uma filial selecionada.
O assistente não recalcula benefícios nem escreve no banco operacional.`;

@Injectable()
export class AssistenteConhecimento {
  private readonly pacote: Pacote | undefined;
  constructor() {
    try {
      const pacote = JSON.parse(
        readFileSync(
          resolve(process.cwd(), 'assistente-knowledge.json'),
          'utf8',
        ),
      ) as Pacote;
      if (Array.isArray(pacote.files)) this.pacote = pacote;
    } catch {
      /* A ausência do pacote é informada na configuração e nas fontes. */
    }
  }

  estado() {
    return {
      arquivos: this.pacote?.files.length ?? 0,
      frontend:
        this.pacote?.files.some((file) =>
          file.path.startsWith('administration/'),
        ) ?? false,
      revisao: this.pacote?.revision.slice(0, 12) ?? null,
      atualizadoEm: this.pacote?.generatedAt ?? null,
    };
  }

  buscar(pergunta: string, perfil: string) {
    if (perfil !== 'admin' || !this.pacote)
      return {
        texto: guia,
        fontes: ['Guia operacional do Vale'],
        estado: this.estado(),
      };
    const normalizar = (text: string) =>
      text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
    const termos = normalizar(pergunta)
      .split(/[^a-z0-9_]+/)
      .filter((term) => term.length > 3)
      .slice(0, 18);
    const trechos = this.pacote.files
      .flatMap((file) => {
        // Fontes do próprio assistente não ajudam a explicar as regras operacionais.
        if (/\/assistente\/|AssistenteConfiguracaoPage/.test(file.path))
          return [];
        const linhas = file.text.split('\n');
        const partes: {
          caminho: string;
          linha: number;
          trecho: string;
          pontos: number;
        }[] = [];
        for (let inicio = 0; inicio < linhas.length; inicio += 32) {
          const trecho = linhas
            .slice(inicio, inicio + 40)
            .join('\n')
            .slice(0, 2400);
          const busca = normalizar(file.path + '\n' + trecho);
          const pontos = termos.reduce(
            (sum, term) => sum + (busca.includes(term) ? 1 : 0),
            0,
          );
          if (pontos)
            partes.push({
              caminho: file.path,
              linha: inicio + 1,
              trecho,
              pontos,
            });
        }
        return partes;
      })
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, 5);
    return {
      texto: guia + '\n\n' + JSON.stringify(trechos),
      fontes: [
        'Guia operacional do Vale',
        ...trechos.map((part) => part.caminho + ':' + part.linha),
      ],
      estado: this.estado(),
    };
  }
}
