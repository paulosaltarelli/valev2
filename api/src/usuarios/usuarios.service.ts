import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { usuario, Prisma } from '@prisma/client';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllUsuarios(): Promise<usuario[]> {
    return this.prisma.usuario.findMany();
  }

  async getUsuarioByCodusuario(codusuario: string): Promise<usuario | null> {
    return this.prisma.usuario.findFirst({
      where: { login: codusuario },
    });
  }

  async updateUsuarioById(
    usuarioId: number,
    payload: Partial<usuario>,
  ): Promise<boolean> {
    try {
      delete payload.usuario_id;
      payload.rm_user_id = payload.login;
      const result = await this.prisma.usuario.update({
        where: { usuario_id: usuarioId },
        data: payload,
      });
      return result ? true : false;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('Failed to update usuario: Unknown error');
    }
  }

  async createUsuario(payload: Prisma.usuarioCreateInput): Promise<boolean> {
    try {
      payload.rm_user_id = payload.login;
      await this.prisma.usuario.create({
        data: {
          data_criacao: new Date(),
          ...payload,
        },
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('Failed to create usuario: Unknown error');
    }
  }

  async deleteUsuarioById(usuarioId: number): Promise<boolean> {
    try {
      await this.prisma.usuario.delete({
        where: { usuario_id: usuarioId },
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error('Failed to delete usuario: Unknown error');
    }
  }
}
