/**
 * AppError utility
 * File: src/utils/AppError.ts
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
