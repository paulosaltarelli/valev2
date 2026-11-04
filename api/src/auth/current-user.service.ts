import {
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import type { JwtPayload } from './types';

@Injectable({ scope: Scope.REQUEST })
export class CurrentUserService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  getJwtPayload(): JwtPayload {
    const payload = this.request?.user as JwtPayload | undefined;
    if (!payload?.sessionId) throw new UnauthorizedException();
    return payload;
  }

  getUsuarioId(): number {
    const payload = this.getJwtPayload();

    return payload?.usuarioId ?? 0;
  }
}
