import { describe, expect, it } from 'vitest';
import { configurarGestion } from '../../modules/gestion/gestion.connection';

describe('conexión independiente de Búsqueda Gestión', () => {
  it('usa el destino configurado y mantiene las sesiones de solo lectura', () => {
    const cfg = configurarGestion('postgresql://lector:clave%40de%3Aprueba@gestion.example.invalid:5433/consultas_rppc');
    expect(cfg).toMatchObject({
      host: 'gestion.example.invalid',
      port: 5433,
      database: 'consultas_rppc',
      user: 'lector',
      password: 'clave@de:prueba',
      application_name: 'PRISMA-busqueda-gestion',
    });
    expect(cfg.options).toContain('default_transaction_read_only=on');
  });

  it.each([
    '',
    'postgresql://lector:clave-ficticia@host/oficialia_partes',
    'postgresql://lector:clave-ficticia@host/consultas_gisnet',
    'postgresql://lector@host/consultas_rppc',
    'postgresql://lector:clave-ficticia@host/consultas_rppc?sslmode=require',
  ])('rechaza una conexión fuera del contrato de Gestión (caso %#)', url => {
    try {
      configurarGestion(url);
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 503 });
      expect((err as Error).message).not.toContain('clave-ficticia');
      return;
    }
    throw new Error('Se aceptó una URL de conexión inválida.');
  });
});
