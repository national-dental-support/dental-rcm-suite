import { Request } from 'express';

export interface PaginationParams {
  page: number;    // 0-based page index
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/**
 * Extract pagination params from query string.
 * Returns { page: 0, pageSize: 25 } by default.
 */
export function parsePagination(req: Request): PaginationParams {
  const page = Math.max(0, parseInt(req.query.page as string, 10) || 0);
  let pageSize = parseInt(req.query.pageSize as string, 10) || DEFAULT_PAGE_SIZE;
  pageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
  return { page, pageSize };
}

/**
 * Wrap a final SELECT with COUNT(*) OVER() and OFFSET/FETCH NEXT.
 * Adds @_PageOffset and @_PageSize inputs to the request.
 */
export function applyPagination(
  request: any, // mssql Request
  pagination: PaginationParams,
): { offsetFetchSql: string } {
  const offset = pagination.page * pagination.pageSize;
  request.input('_PageOffset', offset);
  request.input('_PageSize', pagination.pageSize);

  return {
    offsetFetchSql: `OFFSET @_PageOffset ROWS FETCH NEXT @_PageSize ROWS ONLY`,
  };
}
