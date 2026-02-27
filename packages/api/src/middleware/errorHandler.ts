import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err, req: { method: req.method, url: req.url } }, 'Non-operational error');
    }
    res.status(err.statusCode).json({
      status: 'error',
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // Unhandled/unexpected errors
  logger.error({ err, req: { method: req.method, url: req.url, body: req.body } }, 'Unhandled error');
  res.status(500).json({
    status: 'error',
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred. Please try again.' },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 'error',
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
}
