-- El documento "Oficio" (uno de los 5 requisito) pasa a ser el principal/OCR y es
-- opcional, así que el PDF principal puede quedar nulo.
ALTER TABLE oficios ALTER COLUMN pdf_original_path DROP NOT NULL;

-- SIQROO: ¿la solicitud se ingresó al sistema SIQROO?
-- El número de control y la boleta pueden completarse MÁS TARDE (no se tienen al
-- momento del ingreso). Mientras "aplica" y falten ambos, queda como pendiente.
ALTER TABLE oficios ADD COLUMN IF NOT EXISTS siqroo_aplica          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE oficios ADD COLUMN IF NOT EXISTS siqroo_control_interno VARCHAR(255);
ALTER TABLE oficios ADD COLUMN IF NOT EXISTS siqroo_boleta_url      VARCHAR(255);
