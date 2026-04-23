import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { errorHandler } from './middlewares/errorHandler';
import { rateLimiter } from './middlewares/rateLimiter';
import { logger } from './utils/logger';

// Import routes
import authRoutes from './routes/auth.routes';
import clientAuthRoutes from './routes/clientAuth.routes';
import lotRoutes from './routes/lot.routes';
import contractRoutes from './routes/contract.routes';
import paymentRoutes from './routes/payment.routes';
import projectRoutes from './routes/project.routes';
import clientRoutes from './routes/client.routes';

const app: Application = express();

// =============================================================================
// Security Middlewares
// =============================================================================

// Helmet - Security headers
app.use(helmet());

// CORS - Cross-Origin Resource Sharing
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Rate limiting
app.use(rateLimiter);

// =============================================================================
// General Middlewares
// =============================================================================

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// HTTP request logger
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim()),
      },
    })
  );
}

// =============================================================================
// API Routes
// =============================================================================

const API_VERSION = process.env.API_VERSION || 'v1';

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// API info
app.get(`/api/${API_VERSION}`, (req: Request, res: Response) => {
  res.status(200).json({
    name: 'CentralHub API',
    version: API_VERSION,
    description: 'Sistema inmobiliario full-stack',
    company: 'Seventy Seven Studio',
    endpoints: {
      // Autenticación interna (equipo)
      auth: `/api/${API_VERSION}/auth`,
      // Autenticación clientes (portal B2C)
      clientAuth: `/api/${API_VERSION}/client-auth`,
      // Recursos
      projects: `/api/${API_VERSION}/projects`,
      clients: `/api/${API_VERSION}/clients`,
      lots: `/api/${API_VERSION}/lots`,
      contracts: `/api/${API_VERSION}/contracts`,
      payments: `/api/${API_VERSION}/payments`,
      health: '/health',
    },
  });
});

// API Routes
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/client-auth`, clientAuthRoutes);
app.use(`/api/${API_VERSION}/projects`, projectRoutes);
app.use(`/api/${API_VERSION}/clients`, clientRoutes);
app.use(`/api/${API_VERSION}/lots`, lotRoutes);
app.use(`/api/${API_VERSION}/contracts`, contractRoutes);
app.use(`/api/${API_VERSION}/payments`, paymentRoutes);

// =============================================================================
// Error Handling
// =============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global error handler
app.use(errorHandler);

export default app;
