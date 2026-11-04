import {
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
  Body,
  Delete,
  Post,
} from '@nestjs/common';
import { FilialService } from './filial.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { filial, Prisma } from '@prisma/client';
import type { FuncionarioRm } from 'src/models/FuncionarioRmModel';
import { ProfileGuard } from 'src/profile/profile.guard';
import { Profiles } from 'src/profile/profiles.decorator';

@Controller('filial')
export class FilialController {
  constructor(private readonly filialService: FilialService) {}

  @Get('all')
  @UseGuards(JwtAuthGuard)
  async getAllFiliais() {
    return this.filialService.getAllFiliais();
  }

  @Get(':filialId/funcionarios-rm')
  @UseGuards(JwtAuthGuard)
  async getFuncionariosRmByFilialId(
    @Param('filialId') filialId: number,
  ): Promise<FuncionarioRm[]> {
    return this.filialService.getFuncionariosRmByFilialId(filialId);
  }

  @Get(':filialId')
  @UseGuards(JwtAuthGuard)
  async getFilialById(@Param('filialId') filialId: number): Promise<filial> {
    return this.filialService.getFilialById(filialId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async createFilial(
    @Body() payload: Prisma.filialUncheckedCreateInput,
  ): Promise<{ status: boolean; message: string; data?: filial }> {
    const result = await this.filialService.createFilial(payload);
    return {
      status: true,
      message: 'Filial created successfully',
      data: result,
    };
  }

  @Put(':filialId')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async updateFilialById(
    @Param('filialId') filialId: number,
    @Body() payload: Partial<filial>,
  ): Promise<{ status: boolean; message: string; data?: filial }> {
    const result = await this.filialService.updateFilialById(filialId, payload);
    return {
      status: result,
      message: result
        ? 'Filial updated successfully'
        : 'Failed to update filial',
    };
  }

  @Delete(':filialId')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async disableFilialById(
    @Param('filialId') filialId: number,
  ): Promise<{ status: boolean; message: string; data?: filial }> {
    await this.filialService.disableFilialById(filialId);
    return {
      status: true,
      message: 'Filial disabled successfully',
    };
  }
}
