import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { PasswordModule } from './password/password.module';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { CurrentUserService } from './current-user.service';
import { RmModule } from '../rm/rm.module';
import { CryptoModule } from '../security/crypto.module';
import { RmSessionModule } from '../rm-session/rm-session.module';
import { UsuariosModule } from 'src/usuarios/usuarios.module';

@Module({
  providers: [AuthService, JwtStrategy, CurrentUserService],
  imports: [
    PasswordModule,
    UsuariosModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: {
        expiresIn: Math.max(
          60,
          Number(process.env.JWT_EXPIRATION_TIME ?? 720) * 60,
        ),
      },
    }),
    RmModule,
    CryptoModule,
    RmSessionModule,
  ],
  controllers: [AuthController],
  exports: [CurrentUserService],
})
export class AuthModule {}
