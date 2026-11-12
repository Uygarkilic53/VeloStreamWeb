import type { FastifyReply } from "fastify";
import type { ZodError, ZodTypeAny, z } from "zod";

export type FieldErrors = Record<string, string[]>;

export interface ApiErrorBody {
  error: string;
  message: string;
  fieldErrors?: FieldErrors;
}

export class HttpApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fieldErrors: FieldErrors | undefined;

  constructor(statusCode: number, code: string, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "HttpApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function formatZodErrors(zodError: ZodError): {
  message: string;
  fieldErrors: FieldErrors;
} {
  const fieldErrors: FieldErrors = {};
  for (const issue of zodError.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    const list = fieldErrors[key] ?? [];
    list.push(issue.message);
    fieldErrors[key] = list;
  }
  const firstMessage = zodError.issues[0]?.message ?? "Please check your input fields.";
  return {
    message: firstMessage,
    fieldErrors,
  };
}

export function parseSchema<T extends ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const { message, fieldErrors } = formatZodErrors(parsed.error);
    throw new HttpApiError(400, "VALIDATION_ERROR", message, fieldErrors);
  }
  return parsed.data;
}

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  fieldErrors?: FieldErrors,
) {
  const payload: ApiErrorBody = {
    error: code,
    message,
    ...(fieldErrors && Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
  };
  return reply.code(statusCode).send(payload);
}

export function sendZodValidationError(reply: FastifyReply, zodError: ZodError) {
  const { message, fieldErrors } = formatZodErrors(zodError);
  return sendApiError(reply, 400, "VALIDATION_ERROR", message, fieldErrors);
}
