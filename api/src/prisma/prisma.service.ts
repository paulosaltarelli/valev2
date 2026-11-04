import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
// import { PrismaMariaDb } from '@prisma/adapter-mariadb';
// import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    // const adapter = new PrismaMariaDb({
    //   host: process.env.DATABASE_HOST,
    //   port: parseInt(process.env.DATABASE_PORT!),
    //   user: process.env.DATABASE_USER,
    //   password: process.env.DATABASE_PASSWORD,
    //   database: process.env.DATABASE_NAME,
    //   connectionLimit: 5,
    //   // Necessário quando o MySQL usa caching_sha2_password/sha256_password sem SSL.
    //   // Em produção, prefira SSL ou configurar o usuário com mysql_native_password.
    //   allowPublicKeyRetrieval: true,
    //   // debug: true,
    // });

    const configMssql = {
      server: process.env.DATABASE_HOST!,
      port: parseInt(process.env.DATABASE_PORT!),
      database: process.env.DATABASE_NAME!,
      user: process.env.DATABASE_USER!,
      password: process.env.DATABASE_PASSWORD!,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    };
    const adapter = new PrismaMssql(configMssql);
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      console.error(error);
    }
  }
}
