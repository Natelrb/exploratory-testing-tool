/**
 * Consistent API response format for all API routes
 */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code: string; details?: unknown } };

export function successResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function errorResponse(
  message: string,
  code: string = 'INTERNAL_ERROR',
  details?: unknown
): ApiResponse<never> {
  return {
    success: false,
    error: { message, code, details },
  };
}

/**
 * Extract data from API response or throw on error
 */
export function unwrapApiResponse<T>(response: ApiResponse<T>): T {
  if (response.success) {
    return response.data;
  }
  throw new Error(response.error.message);
}
