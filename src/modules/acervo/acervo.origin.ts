export interface AcervoOriginEnvironment {
  ACERVO_ORIGEN?: string;
  ACERVO_ESQUEMA_CHETUMAL?: string;
  ACERVO_ESQUEMA_CANCUN?: string;
  ACERVO_ESQUEMA_PLAYA?: string;
  ACERVO_ESQUEMA_COZUMEL?: string;
}

export interface AcervoOrigen {
  modo: 'demo' | 'copia_local' | 'servidor';
  base_de_datos: 'acervo_demo' | 'acervo_cozumel' | 'stage' | 'consultas_gisnet';
  esquema: 'public' | 'acervo_prisma';
  esquemas?: Record<number, string>;
}

export const ACERVO_DEMO: AcervoOrigen = {
  modo: 'demo', base_de_datos: 'acervo_demo', esquema: 'public',
};

export function obtenerOrigenAcervo(
  environment: AcervoOriginEnvironment = {
    ACERVO_ORIGEN: process.env.ACERVO_ORIGEN,
    ACERVO_ESQUEMA_CHETUMAL: process.env.ACERVO_ESQUEMA_CHETUMAL,
    ACERVO_ESQUEMA_CANCUN: process.env.ACERVO_ESQUEMA_CANCUN,
    ACERVO_ESQUEMA_PLAYA: process.env.ACERVO_ESQUEMA_PLAYA,
    ACERVO_ESQUEMA_COZUMEL: process.env.ACERVO_ESQUEMA_COZUMEL,
  },
): AcervoOrigen {
  const origen = environment.ACERVO_ORIGEN ?? 'demo';
  if (origen === 'demo') return ACERVO_DEMO;
  if (origen === 'cozumel_local') {
    return { modo: 'copia_local', base_de_datos: 'acervo_cozumel', esquema: 'acervo_prisma' };
  }
  if (origen === 'stage' || origen === 'gisnet') {
    const esquemas = {
      1: environment.ACERVO_ESQUEMA_CHETUMAL ?? 'consulta_chetumal',
      2: environment.ACERVO_ESQUEMA_CANCUN ?? (origen === 'gisnet' ? 'consulta_cancun' : 'cancun'),
      3: environment.ACERVO_ESQUEMA_PLAYA ?? 'consulta_playa',
      4: environment.ACERVO_ESQUEMA_COZUMEL ?? 'consulta_cozumel',
    };
    if (Object.values(esquemas).some(s => !/^[a-z_][a-z0-9_]{0,62}$/.test(s))) {
      throw new Error('Los esquemas de Acervo deben ser identificadores simples.');
    }
    return { modo: 'servidor', base_de_datos: origen === 'gisnet' ? 'consultas_gisnet' : 'stage', esquema: 'acervo_prisma', esquemas };
  }
  throw new Error('ACERVO_ORIGEN debe ser demo, cozumel_local, stage o gisnet.');
}
