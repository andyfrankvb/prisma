/**
 * Cifrado simétrico para secretos guardados en BD (ej. API keys de
 * integraciones externas) — AES-256-GCM con la llave de
 * INTEGRACIONES_ENCRYPTION_KEY (64 caracteres hex = 32 bytes).
 * File: src/utils/crypto.ts
 *
 * No se usa para contraseñas de usuario (eso sigue siendo bcrypt, irreversible
 * a propósito) — esto es para secretos que la app sí necesita poder leer de
 * vuelta para usarlos (ej. llamar a una API externa con esa key).
 */

import crypto from 'crypto';

const ALGORITMO = 'aes-256-gcm';

function obtenerLlave(): Buffer {
  const hex = process.env.INTEGRACIONES_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'INTEGRACIONES_ENCRYPTION_KEY no está configurada o no mide 64 caracteres hex (32 bytes) — ' +
      'genera una con: openssl rand -hex 32',
    );
  }
  return Buffer.from(hex, 'hex');
}

/** Devuelve "iv:tag:cifrado" en hex, todo en un solo string para guardar en una columna text. */
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITMO, obtenerLlave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${cifrado.toString('hex')}`;
}

export function descifrar(valor: string): string {
  const [ivHex, tagHex, cifradoHex] = valor.split(':');
  if (!ivHex || !tagHex || !cifradoHex) throw new Error('Formato de valor cifrado inválido');
  const decipher = crypto.createDecipheriv(ALGORITMO, obtenerLlave(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const texto = Buffer.concat([decipher.update(Buffer.from(cifradoHex, 'hex')), decipher.final()]);
  return texto.toString('utf8');
}
