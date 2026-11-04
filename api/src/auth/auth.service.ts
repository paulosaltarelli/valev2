import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { RmService } from '../rm/rm.service';
import { CryptoService } from '../security/crypto.service';
import type { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './types';
import { randomUUID } from 'crypto';
import { RmSessionService } from '../rm-session/rm-session.service';
import type { RmSessaoRow } from '../rm-session/rm-session.service';
import { UsuariosService } from 'src/usuarios/usuarios.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly rmService: RmService,
    private readonly crypto: CryptoService,
    private readonly rmSession: RmSessionService,
    private readonly usuariosService: UsuariosService,
  ) {}

  private getJwtTtlSeconds() {
    const minutes = Number(process.env.JWT_EXPIRATION_TIME ?? 720);
    return Math.max(60, Math.floor(minutes * 60));
  }

  private getExpiresAt() {
    return new Date(Date.now() + this.getJwtTtlSeconds() * 1000);
  }

  private cookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    // Em produção SEM HTTPS (ex.: teste por IP), Secure=true quebra o login (cookie não é gravado/enviado).
    // Então deixamos a env COOKIE_SECURE sobrescrever o default.
    const secureEnv = process.env.COOKIE_SECURE;
    const secure =
      secureEnv !== undefined ? secureEnv === 'true' : isProd ? true : false;
    return {
      httpOnly: true,
      secure,
      sameSite:
        (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') ?? 'lax',
      path: '/',
      maxAge: this.getJwtTtlSeconds() * 1000,
    } as const;
  }

  async login(body: LoginDto, res: Response) {
    const { username, password } = body;

    const userData = await this.rmService.validateUser(username, password);
    if (!userData) throw new UnauthorizedException();
    //agora busca no banco de dados se o usuario existe e está ativo
    const usuario = await this.usuariosService.getUsuarioByCodusuario(username);
    if (!usuario) throw new UnauthorizedException();
    if (!usuario.ativo) throw new UnauthorizedException();

    const sessionId = randomUUID();

    const payload: JwtPayload = {
      sub: username,
      sessionId,
      username,
      userData,
      usuarioId: usuario.usuario_id,
      perfil: (usuario.perfil as 'admin' | 'operator') ?? 'operator',
    };

    const token = await this.jwtService.signAsync(payload);
    res.cookie('access_token', token, this.cookieOptions());

    const encrypted = this.crypto.encryptJson({ username, password });
    await this.rmSession.createSession({
      sessionId,
      username,
      encryptedCredentials: encrypted,
      expiresAt: this.getExpiresAt(),
    });

    return {
      ok: true,
      user: {
        username,
        name: userData?.NOME,
        perfil: payload.perfil,
      },
    };
  }

  async me(req: Request) {
    const user = req.user as JwtPayload | undefined;
    if (!user?.sessionId) throw new UnauthorizedException();

    const sess = (await this.rmSession.getBySessionId(
      user.sessionId,
    )) as unknown as RmSessaoRow | null;
    if (!sess) throw new UnauthorizedException();
    if (sess.expires_at.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }
    await this.rmSession.touch(user.sessionId);

    // Mantém compatibilidade (data) e adiciona `name` para o frontend reidratar corretamente.
    const userData = user.userData as
      | {
          NOME?: unknown;
          name?: unknown;
        }
      | undefined;
    const name =
      typeof userData?.NOME === 'string'
        ? userData.NOME
        : typeof userData?.name === 'string'
          ? userData.name
          : '';

    return {
      ok: true,
      user: {
        username: user.username,
        name,
        data: user.userData,
        perfil: user.perfil,
      },
    };
  }

  async logout(req: Request, res: Response) {
    const user = req.user as JwtPayload | undefined;
    if (user?.sessionId) {
      await this.rmSession.deleteBySessionId(user.sessionId);
    }

    const { httpOnly, secure, sameSite, path } = this.cookieOptions();
    res.clearCookie('access_token', { httpOnly, secure, sameSite, path });
    return { ok: true };
  }
}
