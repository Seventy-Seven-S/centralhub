// Debe ser el primer import — ver el comentario en loadEnv.ts. En
// producción no se nota (Railway inyecta las env vars al proceso antes de
// arrancar Node), pero en local CORS_ORIGIN del .env nunca se aplicaba:
// siempre caía al fallback de desarrollo porque './app' se cargaba antes
// de que dotenv.config() corriera.
import './loadEnv';
import app from './app';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database';
import { startMoraJob } from './jobs/mora.job';
import { startLiberarApartadosJob } from './jobs/liberarApartados.job';
import { startCleanRateLimitBucketsJob } from './jobs/cleanRateLimitBuckets.job';

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      logger.info(`🚀 CentralHub API running on port ${PORT}`);
      logger.info(`📦 Environment: ${NODE_ENV}`);
      logger.info(`🌐 URL: http://localhost:${PORT}`);
      logger.info(`📚 API Version: ${process.env.API_VERSION || 'v1'}`);
      startMoraJob();
      startLiberarApartadosJob();
      startCleanRateLimitBucketsJob();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
