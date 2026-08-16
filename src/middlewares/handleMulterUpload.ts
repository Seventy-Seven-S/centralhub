import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

// Envuelve multer.single(...) para que un archivo demasiado grande responda
// con un error limpio y consistente, en vez del error crudo de multer.
// Única fuente de verdad para ambas superficies de subida (INE, contrato
// firmado) — mismo shape de respuesta en las dos.
export function handleMulterUpload(upload: multer.Multer, fieldName: string) {
  return function (req: Request, res: Response, next: NextFunction) {
    upload.single(fieldName)(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            code: 'FILE_TOO_LARGE',
            message: 'El archivo no debe superar 10 MB',
          });
        }
        return res.status(400).json({
          success: false,
          message: err instanceof Error ? err.message : 'Error al procesar el archivo',
        });
      }
      next();
    });
  };
}
