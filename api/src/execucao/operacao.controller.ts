import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  Header,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CurrentUserService } from 'src/auth/current-user.service';
import { OperacaoService } from './operacao.service';
import type { PedidoOperacao } from './operacao.service';

@Controller('operacao')
@UseGuards(JwtAuthGuard)
export class OperacaoController {
  constructor(
    private readonly service: OperacaoService,
    private readonly user: CurrentUserService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  summary(@Query('periodo') periodo?: string) {
    return this.service.summary(periodo ? Number(periodo) : undefined);
  }
  @Get(':id/pessoas')
  @Header('Cache-Control', 'no-store')
  detail(
    @Param('id', ParseIntPipe) id: number,
    @Query('pagina') page?: string,
    @Query('busca') search?: string,
    @Query('filtro') filter?: string,
  ) {
    return this.service.detail(id, Number(page ?? 1), search, filter);
  }
  @Get(':id/resultado/:resultado')
  @Header('Cache-Control', 'no-store')
  result(
    @Param('id', ParseIntPipe) id: number,
    @Param('resultado', ParseIntPipe) result: number,
  ) {
    return this.service.result(id, result);
  }
  @Get(':id/pessoas/:base/eventos')
  @Header('Cache-Control', 'no-store')
  employeeEvents(@Param('id', ParseIntPipe) id: number, @Param('base', ParseIntPipe) base: number) {
    return this.service.employeeEvents(id, base);
  }
  @Get(':id/pessoas/:base/variaveis')
  @Header('Cache-Control', 'no-store')
  async employeeVariables(
    @Param('id', ParseIntPipe) id: number,
    @Param('base', ParseIntPipe) base: number,
    @Query('incluirFalhas') incluirFalhas?: string,
  ) {
    const detail = await this.service.employeeVariables(id, base);
    return incluirFalhas === '1' ? detail : detail.results;
  }
  @Post('escopo-envio')
  @Header('Cache-Control', 'no-store')
  sendScope(@Body() body: PedidoOperacao) {
    return this.service.sendScope(body);
  }
  @Get(':id/resultado/:resultado/historico')
  history(
    @Param('id', ParseIntPipe) id: number,
    @Param('resultado', ParseIntPipe) result: number,
    @Query('antes') before?: string,
  ) {
    return this.service.history(
      id,
      result,
      before ? Number(before) : undefined,
    );
  }
  @Post(':id/resultado/:resultado/conferir')
  review(
    @Param('id', ParseIntPipe) id: number,
    @Param('resultado', ParseIntPipe) result: number,
    @Body() body: { revisao: number },
  ) {
    return this.service.review(
      id,
      result,
      body.revisao,
      this.user.getJwtPayload().usuarioId,
    );
  }
  @Post(':id/resultado/:resultado/ajustar')
  adjust(
    @Param('id', ParseIntPipe) id: number,
    @Param('resultado', ParseIntPipe) result: number,
    @Body() body: { revisao: number; valor: number; motivo: string },
  ) {
    return this.service.adjust(
      id,
      result,
      body.valor,
      body.motivo,
      body.revisao,
      this.user.getJwtPayload().usuarioId,
    );
  }
  @Post('previa')
  preview(@Body() body: PedidoOperacao) {
    return this.service.preview(body, this.user.getJwtPayload().usuarioId);
  }
  @Post(':id/fila/:acao')
  controlQueue(
    @Param('id', ParseIntPipe) id: number,
    @Param('acao') action: string,
  ) {
    return this.service.controlQueue(id, action, this.user.getJwtPayload().sessionId);
  }
  @Post('executar')
  execute(@Body() body: PedidoOperacao) {
    const u = this.user.getJwtPayload();
    return this.service.execute(body, u.usuarioId, u.sessionId);
  }
  @Post('confirmar')
  confirm(@Body() body: { id: string }) {
    const u = this.user.getJwtPayload();
    return this.service.confirm(body.id, u.usuarioId, u.sessionId);
  }
}
