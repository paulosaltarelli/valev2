import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Put,
  Delete,
} from '@nestjs/common';
import { PeriodoService } from './periodo.service';
import { periodo, Prisma } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ProfileGuard } from 'src/profile/profile.guard';
import { Profiles } from 'src/profile/profiles.decorator';

@Controller('periodo')
export class PeriodoController {
  constructor(private readonly periodoService: PeriodoService) {}
  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllPeriodos(): Promise<periodo[]> {
    return this.periodoService.getAllPeriodos();
  }

  @Get('ativos')
  @UseGuards(JwtAuthGuard)
  async getAllPeriodosAtivos(): Promise<periodo[]> {
    return this.periodoService.getAllPeriodosAtivos();
  }

  @Post()
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async createPeriodo(
    @Body() payload: Prisma.periodoCreateInput,
  ): Promise<{ status: boolean; message: string }> {
    await this.periodoService.createPeriodo(payload);
    return { status: true, message: 'Periodo created successfully' };
  }

  @Put(':periodoId')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async updatePeriodoById(
    @Param('periodoId') periodoId: number,
    @Body() payload: Prisma.periodoUpdateInput,
  ): Promise<{ status: boolean; message: string }> {
    await this.periodoService.updatePeriodoById(periodoId, payload);
    return { status: true, message: 'Periodo updated successfully' };
  }

  @Delete(':periodoId')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async deletePeriodoById(
    @Param('periodoId') periodoId: number,
  ): Promise<{ status: boolean; message: string }> {
    await this.periodoService.deletePeriodoById(periodoId);
    return { status: true, message: 'Periodo deleted successfully' };
  }
}
