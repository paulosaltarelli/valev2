import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Body,
  Put,
  Delete,
} from '@nestjs/common';
import { FormulaService } from './formula.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import type { formula } from '@prisma/client';
import { ProfileGuard } from 'src/profile/profile.guard';
import { Profiles } from 'src/profile/profiles.decorator';

@Controller()
export class FormulaController {
  constructor(private readonly formulaService: FormulaService) {}

  @Get('filial/:filialId/formula')
  @UseGuards(JwtAuthGuard)
  async getFormulasByFilialId(
    @Param('filialId') filialId: number,
  ): Promise<formula[]> {
    return await this.formulaService.getFormulasByFilialId(filialId);
  }

  @Post('filial/:filialId/formula')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async insertFormula(
    @Param('filialId') filialId: number,
    @Body() formula: formula,
  ): Promise<{ status: boolean; message: string; data?: formula }> {
    const result = await this.formulaService.insertFormula(filialId, formula);
    return {
      status: result,
      message: result
        ? 'Formula inserted successfully'
        : 'Failed to insert formula',
    };
  }

  @Put('filial/:filialId/formula/:formulaId')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async updateFormula(
    @Param('filialId') filialId: number,
    @Param('formulaId') formulaId: number,
    @Body() formula: formula,
  ): Promise<{ status: boolean; message: string; data?: formula }> {
    const result = await this.formulaService.updateFormula(
      filialId,
      formulaId,
      formula,
    );
    return {
      status: !!result,
      message: result
        ? 'Formula updated successfully'
        : 'Failed to update formula',
      data: result,
    };
  }

  @Delete('filial/:filialId/formula/:formulaId')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async deleteFormula(
    @Param('filialId') filialId: number,
    @Param('formulaId') formulaId: number,
  ): Promise<{ status: boolean; message: string; data?: formula }> {
    const result = await this.formulaService.deleteFormula(formulaId);
    return {
      status: !!result,
      message: result
        ? 'Formula deleted successfully'
        : 'Failed to delete formula',
    };
  }
}
