import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../security/crypto.service';
import { OperationalReportsService } from '../dash/operational-reports.service';
import { AssistenteController, AssistenteSessoes } from './assistente.module';
import { AssistenteAvancado } from './assistente-avancado';
import { AssistenteConhecimento } from './assistente-conhecimento';
import { AssistenteConsultas } from './assistente-consultas';
import type { AssistenteSql } from './assistente-sql';
import type { AssistenteInvestigacao } from './assistente-investigacao';
import {
  contextoConsulta,
  type ContextoErros,
  type TurnoAssistente,
} from './assistente-tipos';

const grupo: ContextoErros = {
  tipo: 'funcionarios_com_erro',
  periodoId: 7,
  competencia: '09/2026',
  filial: 'Todas as filiais ativas',
  execucaoIds: [44],
  funcionarioBaseIds: [910001],
  total: 1,
  parcial: false,
  capturadoEm: '2026-11-11T12:00:00Z',
};

it.each(['quais são eles e por que deram erro?','quero saber os funcionarios com erro'])('a continuação preserva o grupo e evita filtros: %s', async (pergunta) => {
  const investigar = {
    responderGrupo: jest
      .fn()
      .mockResolvedValue({ texto: 'Grupo verificado', competencia: '09/2026' }),
  };
  const options = {
    options: async () => ({
      periodos: [
        { periodo_id: 99, competencia: '10/2026', ativo: true },
        { periodo_id: 7, competencia: '09/2026', ativo: true },
      ],
      filiais: [],
    }),
  };
  const service = new AssistenteAvancado(
    {} as AssistenteConsultas,
    options as unknown as OperationalReportsService,
    new AssistenteConhecimento(),
    {} as AssistenteSql,
    investigar as unknown as AssistenteInvestigacao,
  );
  const fetchMock = jest.spyOn(global, 'fetch');
  try {
    const res = await service.responder(
      { pergunta, periodoId: 99 },
      'operator',
      'gpt-institucional',
      { modelo: 'teste', chave: 'teste' },
      null,
      [
        {
          pergunta: 'tem funcionário com erro?',
          resposta: 'Há 1 registro.',
          contexto: grupo,
        },
      ],
    );
    expect(res.competencia).toBe('09/2026');
    expect(investigar.responderGrupo).toHaveBeenCalledWith(grupo,'gpt-institucional',expect.any(Object),null,...(pergunta.startsWith('quero')?['nomes']:[]));
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    fetchMock.mockRestore();
  }
});

describe('Contexto privado através da API HTTP', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const oldActive = process.env.VALE_ASSISTENTE_ATIVO;
  const oldKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const advanced = { estadoConhecimento: () => ({}), responder: jest.fn() };
  beforeAll(async () => {
    process.env.VALE_ASSISTENTE_ATIVO = 'true';
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      'base64',
    );
    const crypto = new CryptoService();
    jwt = new JwtService({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    });
    advanced.responder.mockImplementation(
      async (
        input: { pergunta: string },
        _perfil: string,
        _provedor: string,
        _cred: unknown,
        _ctx: unknown,
        historico: TurnoAssistente[],
      ) => {
        if (input.pergunta === 'tem funcionário com erro?')
          return {
            texto: 'Há 1 registro com erro.',
            competencia: grupo.competencia,
            filial: grupo.filial,
            [contextoConsulta]: grupo,
          };
        return historico.at(-1)?.contexto
          ? {
              texto: 'Grupo retomado.',
              tabela: {
                colunas: ['Funcionário'],
                linhas: [['Pessoa de teste']],
                parcial: false,
              },
              [contextoConsulta]: historico.at(-1)!.contexto,
            }
          : { texto: 'Contexto ausente.' };
      },
    );
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [AssistenteController],
      providers: [
        JwtStrategy,
        AssistenteSessoes,
        {
          provide: PrismaService,
          useValue: {
            usuario: {
              findUnique: async () => ({ ativo: true, perfil: 'operator' }),
            },
            rm_sessao: {
              findUnique: async () => ({
                username: 'operador',
                expires_at: new Date(Date.now() + 60000),
              }),
            },
            assistente_configuracao: {
              findUnique: async () => ({
                gpt_institucional_ativo: true,
                gpt_modelo: 'gpt-5.4-mini',
                gpt_chave: crypto.encryptJson('chave-de-teste'),
              }),
            },
          },
        },
        { provide: CryptoService, useValue: crypto },
        { provide: AssistenteAvancado, useValue: advanced },
        { provide: AssistenteConsultas, useValue: {} },
        { provide: OperationalReportsService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    if (oldActive === undefined) delete process.env.VALE_ASSISTENTE_ATIVO;
    else process.env.VALE_ASSISTENTE_ATIVO = oldActive;
    if (oldKey === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    else process.env.CREDENTIALS_ENCRYPTION_KEY = oldKey;
  });
  const cookie = (id: number, session: string) =>
    'access_token=' +
    jwt.sign({
      usuarioId: id,
      sessionId: session,
      username: 'operador',
      perfil: 'operator',
    });
  it('preserva a sequência real de POSTs e oculta os IDs internos no resultado e no histórico público', async () => {
    const c = cookie(101, 'contexto-a');
    const a = await request(app.getHttpServer())
      .post('/assistente/conversar')
      .set('Cookie', c)
      .send({
        pergunta: 'tem funcionário com erro?',
        provedor: 'gpt-institucional',
        periodoId: 7,
      })
      .expect(201);
    expect(JSON.stringify(a.body)).not.toContain('910001');
    const b = await request(app.getHttpServer())
      .post('/assistente/conversar')
      .set('Cookie', c)
      .send({
        pergunta: 'quais são eles e por que deram erro?',
        provedor: 'gpt-institucional',
      })
      .expect(201);
    expect(b.body.texto).toBe('Grupo retomado.');
    const state = await request(app.getHttpServer())
      .get('/assistente')
      .set('Cookie', c)
      .expect(200);
    expect(state.body.historico).toHaveLength(2);
    expect(JSON.stringify(state.body)).not.toContain('funcionarioBaseIds');
    expect(JSON.stringify(state.body)).not.toContain('910001');
    expect(state.body.historico[0]).not.toHaveProperty('contexto');
  });
  it('não compartilha o grupo com outra sessão do mesmo usuário nem com outro usuário', async () => {
    const a = await request(app.getHttpServer())
      .post('/assistente/conversar')
      .set('Cookie', cookie(101, 'contexto-b'))
      .send({
        pergunta: 'quais são eles e por que deram erro?',
        provedor: 'gpt-institucional',
      })
      .expect(201);
    expect(a.body.texto).toBe('Contexto ausente.');
    const b = await request(app.getHttpServer())
      .post('/assistente/conversar')
      .set('Cookie', cookie(102, 'contexto-a'))
      .send({
        pergunta: 'quais são eles e por que deram erro?',
        provedor: 'gpt-institucional',
      })
      .expect(201);
    expect(b.body.texto).toBe('Contexto ausente.');
  });
  it('rejeita IDs e contexto de grupo enviados pelo cliente', async () => {
    await request(app.getHttpServer())
      .post('/assistente/conversar')
      .set('Cookie', cookie(103, 'contexto-c'))
      .send({ pergunta: 'quais são eles?', contexto: grupo })
      .expect(400);
  });
});

it.each(['onde tem erro ?','e agora?'])('a conversa usa as ferramentas corretas sem repetir filtros: %s',async pergunta=>{
 const consultas={consultar:jest.fn().mockResolvedValue({texto:'Panorama',[contextoConsulta]:grupo})};
 const investigacao={responderGrupo:jest.fn().mockResolvedValue({texto:'Funcionários e orientação',competencia:'09/2026'})};
 const service=new AssistenteAvancado(consultas as unknown as AssistenteConsultas,{options:async()=>({periodos:[{periodo_id:7,competencia:'09/2026',ativo:true}],filiais:[]})} as unknown as OperationalReportsService,new AssistenteConhecimento(),{} as AssistenteSql,investigacao as unknown as AssistenteInvestigacao);
 const fetchMock=jest.spyOn(global,'fetch');
 try{
  const prioridade=pergunta==='e agora?';
  const resposta=await service.responder({pergunta},'operator','gpt-institucional',{modelo:'teste',chave:'teste'},null,prioridade?[{pergunta:'onde tem erro?',resposta:'Grupo encontrado',contexto:grupo}]:[]);
  expect(resposta.texto).toBe('Funcionários e orientação');expect(fetchMock).not.toHaveBeenCalled();
  if(prioridade){expect(consultas.consultar).not.toHaveBeenCalled();expect(investigacao.responderGrupo).toHaveBeenCalledWith(grupo,'gpt-institucional',expect.any(Object),null,'prioridade');}
  else expect(consultas.consultar).toHaveBeenCalledWith('erros',expect.objectContaining({periodoId:7}),'operator');
 }finally{fetchMock.mockRestore()}
});
