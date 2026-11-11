import { Prisma } from '@prisma/client';

// Only the event saved with this calculation; never resolve current formula configuration or query RM.
export const savedCalculationEventSql = Prisma.sql`
CASE WHEN JSON_VALUE(CASE WHEN ISJSON(ef.formula_snapshot) = 1 THEN ef.formula_snapshot ELSE N'{}' END, '$.snapshot_origem') = 'CONFERENCIA_LEGADO'
THEN N'Evento não registrado'
ELSE COALESCE(
  NULLIF(LTRIM(RTRIM(JSON_VALUE(CASE WHEN ISJSON(ef.formula_snapshot) = 1 THEN ef.formula_snapshot ELSE N'{}' END, '$.evento_calculo.valor'))), ''),
  CASE WHEN JSON_QUERY(CASE WHEN ISJSON(ef.formula_snapshot) = 1 THEN ef.formula_snapshot ELSE N'{}' END, '$.evento_calculo') IS NULL
    AND JSON_VALUE(CASE WHEN ISJSON(ef.formula_snapshot) = 1 THEN ef.formula_snapshot ELSE N'{}' END, '$.codEvento') NOT LIKE '%(:%'
    THEN NULLIF(LTRIM(RTRIM(JSON_VALUE(CASE WHEN ISJSON(ef.formula_snapshot) = 1 THEN ef.formula_snapshot ELSE N'{}' END, '$.codEvento'))), '') END,
  N'Evento não registrado') END
`;
