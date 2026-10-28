import { AppError } from '../../utils/AppError';
import { CAMPOS_ORDEN_INMUEBLE } from './acervo.search.types';
import type { AcervoOrden } from './acervo.search.types';

/** Columnas y direcciones permitidas; nunca interpola identificadores del usuario. */
export function ordenInmueblesSql(alias: string, orden: AcervoOrden): string {
  if (!CAMPOS_ORDEN_INMUEBLE.some(campo => campo === orden.campo)
      || (orden.direccion !== 'asc' && orden.direccion !== 'desc')) {
    throw new AppError('El orden de inmuebles no es válido.', 400);
  }
  const direccion = orden.direccion === 'desc' ? 'DESC' : 'ASC';
  const folio = `CASE WHEN ${alias}.folio ~ '^[0-9]+$' THEN ${alias}.folio::numeric END ASC NULLS LAST,
    ${alias}.folio, ${alias}.folio_id::bigint`;
  if (orden.campo === 'folio') return direccion === 'ASC' ? folio
    : `CASE WHEN ${alias}.folio ~ '^[0-9]+$' THEN ${alias}.folio::numeric END DESC NULLS LAST,
    ${alias}.folio DESC, ${alias}.folio_id::bigint`;
  // fre_orden es el menor F.R.E. confirmado, calculado antes de LIMIT.
  // Los ausentes o ambiguos quedan al final en ambos sentidos.
  if (orden.campo === 'fre') return `${alias}.fre_orden ${direccion} NULLS LAST, ${folio}`;
  const columna = orden.campo === 'propietario'
    ? `(SELECT string_agg(t.nombre, ' · ' ORDER BY t.posicion)
        FROM jsonb_array_elements_text(coalesce(${alias}.propietarios, '[]'::jsonb))
          WITH ORDINALITY AS t(nombre, posicion))`
    : `${alias}.${orden.campo}`;
  const valor = `nullif(btrim(${columna}::text), '')`;
  const texto = `translate(upper(${valor}), 'ÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜ', 'AAAAEEEEIIIIOOOOUUUU')`;
  if (orden.campo === 'superficie_total') {
    return `CASE WHEN ${valor} ~ '^[0-9]+([.,][0-9]+){0,1}$'
      THEN replace(${valor}, ',', '.')::numeric END ${direccion} NULLS LAST,
      ${texto} ${direccion} NULLS LAST, ${folio}`;
  }
  if (orden.campo === 'clave_catastral' || orden.campo === 'lote' || orden.campo === 'manzana') {
    // Conserva el identificador visible: 2, 9, 9A, 10; admite ceros iniciales.
    return `CASE WHEN ${valor} ~ '^[0-9]+' THEN substring(${valor} FROM '^[0-9]+')::numeric END ${direccion} NULLS LAST,
      regexp_replace(${texto}, '^[0-9]+', '') ${direccion} NULLS LAST,
      ${texto} ${direccion} NULLS LAST, ${folio}`;
  }
  return `${texto} ${direccion} NULLS LAST, ${folio}`;
}
