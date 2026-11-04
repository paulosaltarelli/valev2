import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type RmSessaoRow = {
  rm_sessao_id: number;
  session_id: string;
  username: string;
  encrypted_credentials: string;
  expires_at: Date;
  created_at: Date;
  last_seen_at: Date | null;
};

type RmSessaoDelegate = {
  create(args: {
    data: {
      session_id: string;
      username: string;
      encrypted_credentials: string;
      expires_at: Date;
    };
  }): Promise<RmSessaoRow>;
  findUnique(args: {
    where: { session_id: string };
  }): Promise<RmSessaoRow | null>;
  deleteMany(args: {
    where: { session_id: string };
  }): Promise<{ count: number }>;
  updateMany(args: {
    where: { session_id: string };
    data: { last_seen_at: Date };
  }): Promise<{ count: number }>;
};

@Injectable()
export class RmSessionService {
  constructor(private readonly prisma: PrismaService) {}

  // Tipagem local do delegate para evitar falsos-positivos do ESLint com o Prisma Client.
  private get rmSessao(): RmSessaoDelegate {
    return (this.prisma as unknown as { rm_sessao: RmSessaoDelegate })
      .rm_sessao;
  }

  async createSession(params: {
    sessionId: string;
    username: string;
    encryptedCredentials: string;
    expiresAt: Date;
  }): Promise<RmSessaoRow> {
    const { sessionId, username, encryptedCredentials, expiresAt } = params;
    return await this.rmSessao.create({
      data: {
        session_id: sessionId,
        username,
        encrypted_credentials: encryptedCredentials,
        expires_at: expiresAt,
      },
    });
  }

  async getBySessionId(sessionId: string): Promise<RmSessaoRow | null> {
    return await this.rmSessao.findUnique({
      where: { session_id: sessionId },
    });
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.rmSessao.deleteMany({
      where: { session_id: sessionId },
    });
  }

  async touch(sessionId: string): Promise<void> {
    await this.rmSessao.updateMany({
      where: { session_id: sessionId },
      data: { last_seen_at: new Date() },
    });
  }
}
