// Debe ser el PRIMER import de index.ts, antes que './app' — ES modules
// hoistea todos los imports de un archivo antes de cualquier otra
// sentencia, así que un dotenv.config() escrito DESPUÉS de "import app
// from './app'" en el mismo archivo siempre corre tarde: app.ts ya leyó
// process.env.CORS_ORIGIN (undefined) al cargar. Entre módulos distintos
// el orden de importación SÍ es el orden de declaración, por eso este
// archivo existe aparte y se importa primero.
import dotenv from 'dotenv';
dotenv.config();
