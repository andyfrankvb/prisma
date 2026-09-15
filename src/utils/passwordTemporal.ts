/**
 * Contraseñas temporales: las que el superadmin le genera a alguien que perdió la suya.
 * File: src/utils/passwordTemporal.ts
 *
 * ── Por qué no son ni un número ni una cadena aleatoria ──────────────────────
 *
 * Esta contraseña se DICTA POR TELÉFONO. No hay servicio de correo, así que el
 * superadmin la lee en voz alta o la escribe en un mensaje. Una cadena tipo
 * `x7Kq#2vB` se dicta mal, se copia peor y termina anotada en un papel.
 *
 * Y no puede seguir un molde. Si fueran `Prisma2026` o el nombre de la persona con
 * un número, quien haya visto una adivina las demás al primer intento — y como
 * estas temporales NO caducan, esa adivinanza serviría para siempre. Fácil de
 * dictar no puede significar fácil de suponer.
 *
 * Dos palabras al azar más tres dígitos resuelven las dos cosas: se dictan sin
 * esfuerzo —«coral, guion, mango, guion, cuatro siete dos»— y dan del orden de 60
 * millones de combinaciones. Con el límite de nginx en el inicio de sesión (5
 * intentos por minuto y dirección), probarlas todas tomaría años.
 *
 * ── Cómo se eligieron las palabras ───────────────────────────────────────────
 *
 * Cortas, comunes, y sobre todo sin nada que se pierda al dictarlas: ni acentos ni
 * eñes —que además cuestan de teclear en algunos teléfonos—, ni parejas que suenen
 * igual por una línea mala (vaca/baca, cima/sima).
 */
import crypto from 'crypto';

const PALABRAS = [
  'agua', 'aire', 'alga', 'arco', 'arena', 'aula', 'ave', 'barco', 'bosque', 'brisa',
  'bruma', 'cable', 'cactus', 'cadena', 'calle', 'campo', 'canela', 'carbon', 'carta', 'cedro',
  'cielo', 'cima', 'ciruela', 'clavo', 'coco', 'codigo', 'colina', 'coral', 'corcho', 'cristal',
  'cuarzo', 'cuerda', 'dedal', 'delta', 'diente', 'disco', 'duna', 'eco', 'enebro', 'escala',
  'espiga', 'estrella', 'faro', 'ficha', 'fierro', 'flauta', 'flecha', 'flor', 'fresa', 'fuego',
  'fuente', 'galera', 'ganso', 'garza', 'globo', 'grano', 'granito', 'guitarra', 'halcon', 'harina',
  'hielo', 'hierro', 'higo', 'hilo', 'hoja', 'horno', 'huerto', 'humo', 'iglesia', 'imprenta',
  'isla', 'jarra', 'jardin', 'jazmin', 'juncal', 'kiosco', 'ladrillo', 'lago', 'lampara', 'lanza',
  'lapiz', 'laurel', 'leche', 'lienzo', 'lima', 'limon', 'lirio', 'llave', 'lluvia', 'loma',
  'lote', 'luna', 'madera', 'maiz', 'malecon', 'mango', 'manta', 'mapa', 'marco', 'marea',
  'marmol', 'martillo', 'mesa', 'miel', 'mirlo', 'monte', 'morada', 'motor', 'muelle', 'muro',
  'naranja', 'nido', 'niebla', 'nogal', 'norte', 'nube', 'nuez', 'olivo', 'olmo', 'onda',
  'orilla', 'oro', 'ostra', 'palma', 'pantano', 'papel', 'parque', 'pato', 'pecera', 'pelicano',
  'perla', 'pino', 'pinza', 'piedra', 'pintura', 'planta', 'plata', 'playa', 'pluma', 'polea',
  'pozo', 'pradera', 'puente', 'puerta', 'puerto', 'quijote', 'quinta', 'rama', 'rampa', 'raiz',
  'raton', 'rejilla', 'reloj', 'remo', 'resina', 'ribera', 'rio', 'roble', 'roca', 'rueda',
  'sable', 'sal', 'salto', 'sauce', 'selva', 'semilla', 'sierra', 'silla', 'sombra', 'sur',
  'tabla', 'taller', 'tambor', 'tapa', 'tarima', 'techo', 'tela', 'templo', 'tienda', 'tierra',
  'tigre', 'tinta', 'toldo', 'torre', 'trigo', 'trineo', 'trompeta', 'tronco', 'tuna', 'tunel',
  'turbina', 'uva', 'valle', 'vela', 'ventana', 'verja', 'vidrio', 'viento', 'vino', 'yunque',
];

/** Un entero de 0 a max-1, con el generador criptográfico y sin sesgo por módulo. */
function alAzar(max: number): number {
  return crypto.randomInt(0, max);
}

/**
 * Genera una contraseña temporal legible, del estilo `coral-mango-472`.
 *
 * Las dos palabras nunca se repiten: «coral-coral-472» parece un error del sistema
 * y hace dudar a quien la recibe de si la escuchó bien.
 */
export function generarPasswordTemporal(): string {
  const primera = alAzar(PALABRAS.length);
  let segunda = alAzar(PALABRAS.length);
  while (segunda === primera) segunda = alAzar(PALABRAS.length);

  const digitos = String(alAzar(1000)).padStart(3, '0');
  return `${PALABRAS[primera]}-${PALABRAS[segunda]}-${digitos}`;
}

/** Cuántas combinaciones distintas produce. Se usa en las pruebas. */
export const COMBINACIONES = PALABRAS.length * (PALABRAS.length - 1) * 1000;
