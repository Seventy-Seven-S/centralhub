// Abstracción de storage de archivos privados.
// El swap a S3 en producción implementa esta misma interfaz sin tocar consumidores.
export interface FileStorage {
  saveFile(key: string, data: Buffer, mimeType: string): Promise<void>;
  getFile(key: string): Promise<Buffer>;
  deleteFile(key: string): Promise<void>;
}
