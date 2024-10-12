import type * as PrismaClient from '@prisma/client';

export enum CapeType {
  MOJANG = 'MOJANG',
  OPTIFINE = 'OPTIFINE',
  LABYMOD = 'LABYMOD'
}

export const CAPE_TYPE_STRINGS: string[] = [
  CapeType.MOJANG,
  CapeType.OPTIFINE,
  CapeType.LABYMOD
] satisfies PrismaClient.CapeType[];
