import {
  Controller,
  Get,
  Param,
  Put,
  Body,
  UseGuards,
  Post,
  Delete,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { usuario } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ProfileGuard } from 'src/profile/profile.guard';
import { Profiles } from 'src/profile/profiles.decorator';

@Controller('usuarios')
@UseGuards(JwtAuthGuard, ProfileGuard)
@Profiles('admin')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get('all')
  async getAllUsuarios() {
    return this.usuariosService.getAllUsuarios();
  }

  @Put(':usuarioId')
  async updateUsuarioById(
    @Param('usuarioId') usuarioId: number,
    @Body() payload: Partial<usuario>,
  ): Promise<boolean> {
    return await this.usuariosService.updateUsuarioById(usuarioId, payload);
  }

  @Post()
  async createUsuario(
    @Body() payload: Prisma.usuarioCreateInput,
  ): Promise<{ status: boolean; message: string }> {
    await this.usuariosService.createUsuario(payload);
    return { status: true, message: 'Usuario created successfully' };
  }

  @Delete(':usuarioId')
  async deleteUsuarioById(
    @Param('usuarioId') usuarioId: number,
  ): Promise<{ status: boolean; message: string }> {
    await this.usuariosService.deleteUsuarioById(usuarioId);
    return { status: true, message: 'Usuario deleted successfully' };
  }
}
