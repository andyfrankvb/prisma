# Orden numérico por F.R.E.

Las tablas de Inmueble y Antecedente permiten ordenar por **F.R.E.** con el mismo
icono que las columnas existentes. Cada clic alterna entre ascendente y
descendente. El filtro único **Folio** conserva su búsqueda en ambas numeraciones.

El orden se aplica en PostgreSQL al conjunto completo de coincidencias antes
de LIMIT/OFFSET. Usa el menor F.R.E. confirmado si un inmueble tiene varios.
Los números se comparan con `numeric`, sin orden alfabético ni conversión a
Number de JavaScript. Los registros sin F.R.E. confirmado quedan al final en
ambos sentidos. Los empates usan Folio y, en Antecedente, el ID de inscripción,
para que la paginación sea estable. La clave interna de orden no se expone.

Solo cuando se ordena por F.R.E. se calcula la correspondencia para todos los
folios filtrados; se agrupan los números de folio para evitar consultas por
fila y se reutilizan los datos para la página de resultados. Las demás columnas
conservan el cálculo de F.R.E. por página. La sentencia sigue pasando por el
control existente de cancelación manual, sin corte por duración.

El parámetro permitido es `orden_por=fre` con `orden_direccion=asc|desc`.
Los anchos de columna, el resaltado y la conservación del desplazamiento
utilizan los componentes existentes.

Verificación: API compilada, 61 pruebas unitarias de Acervo, 14 grupos SQL con
datos sintéticos en PostgreSQL embebido, empaquetado Vite y tipado de Acervo.
El verificador SQL comprueba ambos sentidos y ambas tablas a través de cinco
páginas, números como 2/10/100, enteros mayores que el máximo seguro de
JavaScript, varios F.R.E., empates y valores ausentes o ambiguos. Chromium
comprueba los clics en ambas tablas, las direcciones enviadas, anchos estables
y desplazamiento. No se ejecutó el código nuevo contra el servidor privado
desde este entorno; el paquete incluye una comprobación de solo lectura.

La entrega no modifica conexiones, dependencias, Docker, otros módulos ni la
base de datos. Se conserva la limitación ya documentada del tipado global del
frontend por errores previos ajenos a Acervo.
