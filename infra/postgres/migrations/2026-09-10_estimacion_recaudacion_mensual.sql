-- Estimación mensual del departamento de Ingresos vs. Recaudación reportada
-- por RPP (fuente: "RPPC- Recaudación vs Estimación Ene-Ago 2026.xlsx", en
-- bd/). Solo 12 filas por año, se actualiza a mano cuando llegue un ejercicio
-- nuevo o se corrija una cifra — no hay proceso automático que la alimente.
--
-- `reportado_excel` es la cifra que reportó RPP en ese Excel — puede diferir
-- unos puntos porcentuales de lo que ya tenemos cargado en satq_ingresos
-- (distinto corte/exportación); el endpoint de conciliación muestra ambas
-- para que se note la brecha, no la oculta.

CREATE TABLE satq_estimacion_mensual (
    anio             SMALLINT NOT NULL,
    mes              SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    estimado         NUMERIC(14,2) NOT NULL,
    reportado_excel  NUMERIC(14,2),
    PRIMARY KEY (anio, mes)
);

INSERT INTO satq_estimacion_mensual (anio, mes, estimado, reportado_excel) VALUES
(2026, 1,  63821764, 65952568),
(2026, 2,  54945563, 49167839),
(2026, 3,  62905490, 63491216),
(2026, 4,  63033892, 63044058),
(2026, 5,  66433770, 57515033),
(2026, 6,  67377213, 71531798),
(2026, 7,  84369954, 70421757),
(2026, 8,  64702208, 70941539),
(2026, 9,  75166292, NULL),
(2026, 10, 74335590, NULL),
(2026, 11, 56436623, NULL),
(2026, 12, 70146502, NULL);
