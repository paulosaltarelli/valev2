import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Body,
  Delete,
  Put,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { VariavelService } from './variavel.service';
import type { variavel } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { UpdateVariavelDto } from './dto/update-variavel.dto';
import { ProfileGuard } from 'src/profile/profile.guard';
import { Profiles } from 'src/profile/profiles.decorator';
@Controller()
export class VariavelController {
  constructor(private readonly variavelService: VariavelService) {}

  @Get('filial/:filialId/variavel')
  @UseGuards(JwtAuthGuard)
  async getVariaveisByFilialId(
    @Param('filialId', ParseIntPipe) filialId: number,
  ): Promise<variavel[]> {
    return await this.variavelService.getVariaveisByFilialId(filialId);
  }

  @Post('filial/:filialId/variavel')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async createVariavel(
    @Param('filialId', ParseIntPipe) filialId: number,
    @Body() dto: Prisma.variavelUncheckedCreateInput,
  ): Promise<{ status: boolean; message: string; data?: variavel }> {
    const result = await this.variavelService.createVariavel(filialId, dto);
    return {
      status: true,
      message: 'Variavel created successfully',
      data: result,
    };
  }

  @Put('variavel/:variavelId')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async updateVariavel(
    @Param('variavelId', ParseIntPipe) variavelId: number,
    @Body() dto: UpdateVariavelDto,
  ): Promise<{ status: boolean; message: string; data?: variavel }> {
    const result = await this.variavelService.updateVariavel(variavelId, dto);
    return {
      status: true,
      message: 'Variavel updated successfully',
      data: result,
    };
  }

  @Delete('variavel/:variavelId')
  @UseGuards(JwtAuthGuard, ProfileGuard)
  @Profiles('admin')
  async deleteVariavel(
    @Param('variavelId', ParseIntPipe) variavelId: number,
  ): Promise<{ status: boolean; message: string; data?: variavel }> {
    const result = await this.variavelService.deleteVariavel(variavelId);
    return {
      status: result,
      message: result
        ? 'Variavel deleted successfully'
        : 'Failed to delete variavel',
    };
  }
}
