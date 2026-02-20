/**
 * Shared utility functions for case conversion and JSON field parsing.
 */

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively converts all object keys from snake_case to camelCase.
 * Handles nested objects and arrays.
 */
export function toCamelCase<T = Record<string, unknown>>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) return obj.map((item) => toCamelCase(item)) as T;
  if (obj instanceof Date) return obj as T;
  if (typeof obj === "object") {
    const newObj: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      newObj[snakeToCamel(key)] = toCamelCase(
        (obj as Record<string, unknown>)[key]
      );
    }
    return newObj as T;
  }
  return obj as T;
}

/**
 * Recursively converts all object keys from camelCase to snake_case.
 * Handles nested objects and arrays.
 */
export function toSnakeCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => toSnakeCase(item));
  if (obj instanceof Date) return obj;
  if (typeof obj === "object") {
    const newObj: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      newObj[camelToSnake(key)] = toSnakeCase(
        (obj as Record<string, unknown>)[key]
      );
    }
    return newObj;
  }
  return obj;
}

/**
 * Safely parse a JSON-stringified database field into its typed value.
 * Returns null if the value is falsy or parsing fails.
 */
export function parseJsonField<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
