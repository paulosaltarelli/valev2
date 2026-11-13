import {planejarApresentacao,solicitouRelatorio,validarComposicao} from './assistente-apresentacao';
import {consultarModelo} from './assistente-intencao';
jest.mock('./assistente-intencao',()=>({consultarModelo:jest.fn()}));
it.each(['tem funcionário com erro?','qual filial teve maior desconto?','não quero relatório','o que é relatório?'])('não gera arquivo por padrão: %s',p=>expect(solicitouRelatorio(p)).toBe(false));
it.each(['gere um HTML dos erros','dashboard financeiro por filial','quero um relatório'])('respeita o pedido: %s',p=>expect(solicitouRelatorio(p)).toBe(true));
it('valida componentes e preserva acesso ao detalhe',()=>{expect(validarComposicao({layout:'editorial',secoes:['resumo']}).secoes).toEqual(['resumo','detalhe']);expect(()=>validarComposicao({layout:'editorial',secoes:['script']})).toThrow();expect(()=>validarComposicao({layout:'editorial',secoes:['resumo','resumo']})).toThrow();expect(()=>validarComposicao({layout:'editorial',secoes:['resumo'],html:'<script>'})).toThrow();});
it('o modelo escolhe a ordem sem receber valores ou nomes dos registros',async()=>{
 (consultarModelo as jest.Mock).mockResolvedValue(JSON.stringify({layout:'analitico',secoes:['detalhe','resumo']}));
 const r=await planejarApresentacao({texto:'Consulta',tabela:{colunas:['Funcionário','Estado atual'],linhas:[['NOME_PRIVADO','ERRO_RM']],parcial:false}},'Gere um relatório dos erros de NOME_PRIVADO','gpt-institucional',{chave:'teste',modelo:'teste'});
 expect(r.relatorio?.solicitado).toBe(true);expect(r.apresentacao?.composicao?.secoes).toEqual(['detalhe','resumo']);expect(r.apresentacao?.composicao?.origem).toBe('ia');expect((consultarModelo as jest.Mock).mock.calls.at(-1)[3]).not.toContain('NOME_PRIVADO');
});
it('falha no plano não perde os dados nem gera composição insegura',async()=>{(consultarModelo as jest.Mock).mockResolvedValue('{"layout":"executivo","secoes":["<script>"]}');const tabela={colunas:['Filial','Total'],linhas:[['A',1]],parcial:false};const r=await planejarApresentacao({texto:'Consulta',tabela},'Gere HTML','claude',{chave:'teste',modelo:'teste'});expect(r.tabela).toBe(tabela);expect(r.apresentacao?.composicao?.layout).toBe('editorial');expect(r.apresentacao?.composicao?.origem).toBe('automatico');expect(r.relatorio?.solicitado).toBe(true);});

it('pergunta simples não chama o planejador visual',async()=>{(consultarModelo as jest.Mock).mockClear();const r=await planejarApresentacao({texto:'Consulta',tabela:{colunas:['Estado atual'],linhas:[['ERRO']],parcial:false}},'tem funcionário com erro?','gpt-institucional',{chave:'teste',modelo:'teste'});expect(consultarModelo).not.toHaveBeenCalled();expect(r.relatorio?.solicitado).toBe(false);});
