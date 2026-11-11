import { Prisma } from '@prisma/client';

export function sqlServerIds(ids: Iterable<number>) {
  return Prisma.sql`SELECT id FROM OPENJSON(${JSON.stringify([...ids])}) WITH (id INT '$')`;
}

export function* chunks<T>(items: T[], size: number) {
  for (let start = 0; start < items.length; start += size) {
    yield items.slice(start, start + size);
  }
}
