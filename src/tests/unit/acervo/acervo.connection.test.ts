import { describe, expect, it } from 'vitest';
import { crearConfiguracionAcervo } from '../../../modules/acervo/acervo.connection';

const urlFicticia = 'postgresql://lector:clave-ficticia@10.1.100.60:5432/consultas_gisnet';
describe('aislamiento de conexiones de Acervo', () => {
  it.each(['development', 'production'])('GISNET usa su configuración propia en %s', NODE_ENV => {
    const entorno = { NODE_ENV, DATABASE_URL: 'postgresql://principal:ficticia@servidor-prisma/prisma',
      ACERVO_ORIGEN: 'gisnet', ACERVO_DATABASE_URL: urlFicticia };
    const original = { ...entorno };
    const config = crearConfiguracionAcervo(entorno);
    expect(config).toMatchObject({ host: '10.1.100.60', port: 5432, database: 'consultas_gisnet', user: 'lector', password: 'clave-ficticia',
      statement_timeout: 0, query_timeout: 0, options: '-c default_transaction_read_only=on -c jit=off -c statement_timeout=0' });
    expect(entorno).toEqual(original);
  });
  it('la URL principal no sustituye una conexión GISNET ausente', () => {
    expect(() => crearConfiguracionAcervo({ NODE_ENV: 'production', ACERVO_ORIGEN: 'gisnet', DATABASE_URL: urlFicticia })).toThrow('ACERVO_DATABASE_URL');
  });
  it.each([undefined, 'demo', 'stage', 'cozumel_local'])('producción rechaza el origen %s sin caer a la base principal', ACERVO_ORIGEN => {
    expect(() => crearConfiguracionAcervo({ NODE_ENV: 'production', ACERVO_ORIGEN,
      DATABASE_URL: urlFicticia, ACERVO_DATABASE_URL: urlFicticia })).toThrow();
  });
  it('el demo sigue siendo local y utiliza otra base sin modificar el entorno recibido', () => {
    const entorno = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://demo:ficticia@db/oficialia_partes' };
    expect(crearConfiguracionAcervo(entorno)).toMatchObject({ host: 'db', database: 'acervo_demo' });
    expect(entorno.DATABASE_URL).toBe('postgresql://demo:ficticia@db/oficialia_partes');
  });
  it.each([
    'postgresql://lector:clave-ficticia@otro-servidor/consultas_gisnet',
    'postgresql://lector:clave-ficticia@10.1.100.60/prisma',
    'postgresql://lector@10.1.100.60/consultas_gisnet',
    'mysql://lector:clave-ficticia@10.1.100.60/consultas_gisnet',
  ])('rechaza un destino distinto o incompleto', ACERVO_DATABASE_URL => {
    expect(() => crearConfiguracionAcervo({ NODE_ENV: 'production', ACERVO_ORIGEN: 'gisnet', ACERVO_DATABASE_URL })).toThrow();
  });
  it('los parámetros de URL no pueden redirigir el host o la base', () => {
    expect(crearConfiguracionAcervo({ NODE_ENV: 'production', ACERVO_ORIGEN: 'gisnet',
      ACERVO_DATABASE_URL: urlFicticia + '?host=otro&database=prisma' })).toMatchObject({ host: '10.1.100.60', database: 'consultas_gisnet' });
  });
});
