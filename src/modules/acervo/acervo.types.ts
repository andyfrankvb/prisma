export interface AcervoConteos {
  delegaciones: number;
  folios: number;
  titulares: number;
  antecedentes: number;
  actos: number;
}

export interface AcervoEstado {
  estado: 'ok';
  modo: 'demo' | 'copia_local' | 'servidor';
  base_de_datos: 'acervo_demo' | 'acervo_cozumel' | 'stage' | 'consultas_gisnet';
  conteos: AcervoConteos;
}

export interface AcervoRepository {
  obtenerEstado(): Promise<AcervoEstado>;
}
