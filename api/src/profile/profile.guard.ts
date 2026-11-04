import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PROFILES_KEY } from './profiles.decorator';
import type { JwtPayload } from 'src/auth/types';

@Injectable()
export class ProfileGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const allowed = this.reflector.getAllAndOverride<
      Array<'admin' | 'operator'>
    >(PROFILES_KEY, [context.getHandler(), context.getClass()]);

    // Sem @Profiles -> rota pública dentro do módulo autenticado.
    if (!allowed || allowed.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as JwtPayload | undefined;
    const perfil: 'admin' | 'operator' | undefined = user?.perfil;
    if (!perfil) throw new ForbiddenException('Perfil não informado');

    if (!allowed.includes(perfil)) {
      throw new ForbiddenException('Acesso negado para este perfil');
    }

    return true;
  }
}
