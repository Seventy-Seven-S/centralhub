// Abstracción de storage de archivos privados.
// El swap a S3 en producción implementa esta misma interfaz sin tocar consumidores.
export interface FileStorage {
  saveFile(key: string, data: Buffer, mimeType: string): Promise<void>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
}

/**
 * Falla al guardar o leer un documento.
 *
 * Existe para que el detalle técnico NO llegue a la pantalla: una secretaria
 * veía "EACCES: permission denied, mkdir '/data/storage'" dentro del modal de
 * rescisión. El mensaje es lo que se le dice a quien está capturando; el
 * `detalle` es lo que se manda al log para quien tenga que arreglarlo.
 */
export class ErrorDeAlmacenamiento extends Error {
  constructor(mensaje: string, readonly detalle: string) {
    super(mensaje);
    this.name = 'ErrorDeAlmacenamiento';
  }
}
