import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodSchema } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const asyncRoute =
  (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(
      400,
      result.error.issues
        .map((x) => `${x.path.join(".")}: ${x.message}`)
        .join("; "),
    );
  return result.data;
}

export function idParam(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new HttpError(400, "Invalid ID");
  return id;
}
