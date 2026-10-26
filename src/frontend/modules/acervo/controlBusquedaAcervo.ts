interface ConsultaEnCurso {
  url: string;
  opciones: RequestInit;
}

function identificadorConsulta(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

/** Conserva la URL, token, cabeceras de ngrok y opciones del transporte existente. */
export function crearTransporteCancelableAcervo(transporte: typeof fetch) {
  const consultas = new WeakMap<AbortSignal, ConsultaEnCurso>();
  const pedir: typeof fetch = async (entrada, opciones) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const signal = opciones?.signal;
    const prefijo = url.replace(/\/(?:antecedentes|inmuebles)(?:\?.*)?$/, '');
    if (!signal || signal.aborted || prefijo === url || !/\/acervo$/.test(prefijo)) {
      return transporte(entrada, opciones);
    }
    const id = identificadorConsulta();
    const headers = new Headers(opciones?.headers);
    headers.set('X-Acervo-Consulta', id);
    consultas.set(signal, { url: prefijo + '/busquedas/' + id + '/cancelar',
      opciones: { ...opciones, headers: new Headers(headers), method: 'POST', signal: undefined } });
    try { return await transporte(entrada, { ...opciones, headers }); }
    finally { consultas.delete(signal); }
  };
  const cancelarBusqueda = async (signal: AbortSignal): Promise<void> => {
    const consulta = consultas.get(signal);
    // Si el GET ya termino, PostgreSQL ya respondio; solo queda abandonar la lectura del resultado.
    if (!consulta) return;
    const respuesta = await transporte(consulta.url, consulta.opciones);
    const cuerpo = await respuesta.json().catch(() => null) as { estado?: string; message?: string } | null;
    if (!respuesta.ok || cuerpo?.estado !== 'cancelada') {
      throw new Error(cuerpo?.message ?? 'No se pudo confirmar la cancelación. Vuelve a intentar.');
    }
  };
  return { pedir, cancelarBusqueda };
}
