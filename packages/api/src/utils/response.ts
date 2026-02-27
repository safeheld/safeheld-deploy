import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function successResponse<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ status: 'success', data });
}

export function paginatedResponse<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  statusCode = 200
): void {
  res.status(statusCode).json({ status: 'success', data, pagination });
}

export function errorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string
): void {
  res.status(statusCode).json({ status: 'error', error: { code, message } });
}

export function getPaginationParams(
  query: Record<string, unknown>,
  defaultSize = 50,
  maxSize = 200
): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10));
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(String(query.pageSize || String(defaultSize)), 10)));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}
