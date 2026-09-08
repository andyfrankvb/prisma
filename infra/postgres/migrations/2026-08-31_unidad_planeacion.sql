-- Nueva área: «Dirección de Planeación».
--
-- Se da de alta por migración y no desde la pantalla porque el sistema no tiene
-- alta de áreas: `/admin/oficinas` solo lista. Crear una es poco frecuente y toca
-- el organigrama, así que queda por aquí, versionada y con su explicación.
--
-- ── Por qué tipo DIRECCION ───────────────────────────────────────────────────
--
-- Igual que Administrativa, Jurídica e Innovación. `tieneFlujoPropio` exige
-- DELEGACION o DIRECCION para que el área resuelva su propio visto bueno y suba
-- su propio firmado, sin pasar por la secretaría de la Dirección General. Es
-- como trabajan hoy las otras direcciones.
--
-- ── Por qué vobo_por = ENCARGADO ─────────────────────────────────────────────
--
-- El visto bueno lo da el ENCARGADO, sobre el trabajo de su propio equipo. Es el
-- arreglo que ya usan la Dirección Jurídica y la Delegación Othón P. Blanco, y el
-- que se pidió para esta área: el encargado reparte y aprueba lo que su gente
-- termina, sin depender del titular para cada expediente.
--
-- No hace falta migración para cambiarlo. Vive en Administración → Visto bueno
-- por área, que lista delegaciones y direcciones; ahí se alterna entre el titular
-- y el encargado cuando convenga.
--
-- ── recibe_direcciones_area = false ──────────────────────────────────────────
--
-- Solo las delegaciones lo tienen en true: es lo que permite que a su ventanilla
-- le llegue correspondencia dirigida a las direcciones de área. Una dirección no
-- recibe por cuenta de otras.
--
-- ── Lo que ESTA migración no hace, y hay que capturar a mano ─────────────────
--
--   1. El TITULAR: un usuario con rol DIRECTOR y unidad = esta área. Sin él, el
--      área aparece en las listas pero sin destinatario, y no se le puede turnar
--      nada: `areasTurno` exige un DIRECTOR activo para ofrecerla como destino.
--
--   2. El ENCARGADO, en Configuración de Flujos → ENCARGADO → esta unidad. Sin
--      encargado, lo dirigido aquí no cae con nadie y se queda en RECIBIDO. La
--      pantalla lo delata con «Sin encargado configurado».
--
--   3. Los ANALISTAS: función JURIDICO en esta unidad, para quienes trabajen los
--      expedientes. Sin al menos uno, el encargado abrirá «Asignar» y verá la
--      lista vacía —salvo que él dirija además otra área, en cuyo caso se le
--      ofrece también el equipo de aquella—.
--
-- No hace falta tocar `configuracion_destinos`: esa tabla guarda excepciones, no
-- permisos, así que un área sin renglones queda habilitada como origen y como
-- destino de turnado desde el primer día.
--
-- ── Sobre el código de folio ─────────────────────────────────────────────────
--
-- Sus folios llevan «DP»: DP-31_08_2026-0001. Se le agregó su renglón a
-- `codigoDeUnidad` junto con esta migración, porque sin él caía al respaldo —las
-- iniciales de las primeras palabras— y habría quedado «DDP».

INSERT INTO catalogo_unidades (nombre, clave, tipo, vobo_por, activo, recibe_direcciones_area)
SELECT 'Dirección de Planeación', 'dir_planeacion', 'DIRECCION', 'ENCARGADO', true, false
WHERE NOT EXISTS (
  SELECT 1 FROM catalogo_unidades WHERE clave = 'dir_planeacion'
);
