import dotenv from 'dotenv';
import app from './app';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database';
import { startMoraJob } from './jobs/mora.job';

dotenv.config();

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
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
