/**
 * PaseFirmaPanel — mandar el oficio a firma de la Directora General.
 *
 * Un área trabaja el oficio, lo aprueba, y entonces decide quién lo firma: su
 * propio titular —por la firma que le está delegada— o la Directora General,
 * cuando el tema no entra en esa delegación.
 *
 * No es un turno. El oficio no cambia de área ni de destinatario: sigue en la
 * lista de quien lo trabajó y con el mismo «dirigido a» del documento original.
 * Lo único que cambia es que lo cierra la Dirección General.
 *
 * Del otro lado, la secretaría puede regresarlo si hay que corregir algo; el
 * oficio vuelve con quien lo mandó, conservando su visto bueno.
 */
import React from 'react';
import { theme }       from '../theme';
import type { Oficio } from '../types';

export const PaseFirmaPanel: React.FC<{
  oficio: Oficio;
}> = ({ oficio }) => {
  const enEspera = !!oficio.en_pase_firma;
  const devuelto = oficio.pase_firma_devuelto_motivo;

  /**
   * Solo informa; ya no tiene botones.
   *
   * «Mandar a firma» y «Regresar sin firmar» viven ahora en «Acciones», junto
   * con las demás. Tenerlos también aquí dejaba dos botones para lo mismo a un
   * palmo de distancia, y peor: este panel se dibujaba nada más para ofrecerlos,
   * ocupando espacio en oficios donde no había nada que contar.
   *
   * Lo que sí es suyo y no está en ningún otro lado: que el oficio está esperando
   * firma, y por qué lo regresaron la última vez.
   */
  if (!enEspera && !devuelto) return null;

  return (
    <div style={{
      border: `1px solid ${enEspera ? theme.colors.primary : theme.colors.border}`,
      backgroundColor: enEspera ? '#FDE8EF' : theme.colors.background,
      borderRadius: '8px', padding: '14px', marginBottom: '14px',
    }}>
      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Firma
      </span>
      {enEspera && (
        <span style={{ display: 'block', fontSize: '0.75rem', color: theme.colors.textSecondary, marginTop: '2px', maxWidth: '46ch' }}>
          Esperando la firma de la Directora General. El oficio sigue siendo de tu área.
        </span>
      )}

      {/* Lo que pidió corregir la Dirección General la última vez que lo regresó. */}
      {!enEspera && devuelto && (
        <p style={{
          margin: '6px 0 0', padding: '8px 12px', borderRadius: '6px',
          backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.76rem',
        }}>
          <strong>La Dirección General lo regresó sin firmar:</strong> {devuelto}
        </p>
      )}
    </div>
  );
};
