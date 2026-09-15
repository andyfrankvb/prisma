"""
Exporta el universo de actos registrales (bd/REPORTES UNIVERSO/*.xlsx) a un CSV
listo para \\copy en actos_rpp. Carga puntual, no se corre en producción — ver
infra/postgres/migrations/2026-09-15_actos_rpp.sql para el porqué de cada campo.

Uso:
    python3 db/export_actos_rpp.py
Genera: bd/actos_rpp_export.csv
"""
import csv
import os
import time

import openpyxl

FOLDER = os.path.join(os.path.dirname(__file__), "..", "bd", "REPORTES UNIVERSO")
OUT = os.path.join(os.path.dirname(__file__), "..", "bd", "actos_rpp_export.csv")

DATA_SHEETS = {
    "reporte_INMOBILIARIO_1.xlsx": "INMOBILIARIO 1",
    "reporte_INMOBILIARIO_2.xlsx": "INMOBILIARIO 2",
    "reporte_INMOBILIARIO_3.xlsx": "INMOBILIARIO 3",
    "reporte_INMOBILIARIO_4.xlsx": "INMOBILIARIO 4",
    "reporte_INMOBILIARIO_5.xlsx": "INMOBILIARIO 5",
    "reporte_INMOBILIARIO_6.xlsx": "INMOBILIARIO 6",
    "REPORTE - GENERAL - ACTOS - BIENES - MUEBLES - SIQROO.xlsx": "BIENES_MUEBLES 1",
    "REPORTE - GENERAL - ACTOS - PERSONA - MORAL - SIQROO.xlsx": "PERSONA_MORAL 1",
    "REPORTE - GENERAL - ACTOS - TESTAMENTOS - SIQROO.xlsx": "TESTAMENTOS 1",
}

# Prefijo del código de acto -> tipo de trámite (mismo criterio que los 4 tipos de folio en FRE)
PREFIJO_TIPO = {
    "BI": "Inmobiliario",
    "PM": "Persona Moral",
    "BM": "Bien Mueble",
    "T":  "Testamentos",
}

UMBRAL_ACERVO = 2004  # confirmado con Dirección: año < 2004 = acto de acervo registral


def tipo_de_acto(acto: str) -> str:
    for prefijo, tipo in PREFIJO_TIPO.items():
        if acto.startswith(prefijo):
            return tipo
    return "Otro"


def main():
    t0 = time.time()
    total = 0
    with open(OUT, "w", newline="", encoding="utf-8") as out_f:
        writer = csv.writer(out_f)
        writer.writerow([
            "id_origen", "acto", "des_acto", "tipo_tramite", "fecha_registro",
            "anio", "es_acervo", "oficina", "fre", "estatus_acto",
        ])

        for fn, sheetname in DATA_SHEETS.items():
            path = os.path.join(FOLDER, fn)
            t_file = time.time()
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            ws = wb[sheetname]
            n = 0
            for row in ws.iter_rows(min_row=2, values_only=True):
                if row is None or len(row) == 0 or row[0] is None:
                    continue
                vals = list(row[:7]) + [None] * (7 - len(row))
                id_origen, acto, des_acto, fecha, oficina, fre, estatus = vals[:7]
                if not acto:
                    continue
                acto = str(acto).strip()
                des_acto = (des_acto or "").strip()
                tipo_tramite = tipo_de_acto(acto)

                anio = None
                if fecha is not None:
                    try:
                        anio = fecha.year if hasattr(fecha, "year") else int(str(fecha)[:4])
                    except Exception:
                        anio = None

                es_acervo = anio is None or anio < UMBRAL_ACERVO

                writer.writerow([
                    int(id_origen) if id_origen is not None else "",
                    acto,
                    des_acto,
                    tipo_tramite,
                    fecha.isoformat() if hasattr(fecha, "isoformat") else (fecha or ""),
                    anio if anio is not None else "",
                    "t" if es_acervo else "f",
                    (oficina or "").strip(),
                    (fre or "").strip(),
                    (estatus or "").strip(),
                ])
                n += 1
            wb.close()
            total += n
            print(f"{fn}: {n:,} filas exportadas en {time.time() - t_file:.1f}s", flush=True)

    print(f"\nTotal exportado: {total:,} filas en {time.time() - t0:.1f}s -> {OUT}")


if __name__ == "__main__":
    main()
