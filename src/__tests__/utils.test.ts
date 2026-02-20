import { describe, test, expect } from "bun:test";
import {
  toCamelCase,
  toSnakeCase,
  snakeToCamel,
  camelToSnake,
  parseJsonField,
} from "../utils";

describe("snakeToCamel", () => {
  test("converts snake_case to camelCase", () => {
    expect(snakeToCamel("hello_world")).toBe("helloWorld");
    expect(snakeToCamel("business_id")).toBe("businessId");
    expect(snakeToCamel("created_at")).toBe("createdAt");
  });

  test("handles strings without underscores", () => {
    expect(snakeToCamel("hello")).toBe("hello");
  });
});

describe("camelToSnake", () => {
  test("converts camelCase to snake_case", () => {
    expect(camelToSnake("helloWorld")).toBe("hello_world");
    expect(camelToSnake("businessId")).toBe("business_id");
  });

  test("handles strings without capitals", () => {
    expect(camelToSnake("hello")).toBe("hello");
  });
});

describe("toCamelCase", () => {
  test("converts object keys from snake_case to camelCase", () => {
    const input = { business_id: "123", business_name: "Test" };
    const result = toCamelCase(input);
    expect(result).toEqual({ businessId: "123", businessName: "Test" });
  });

  test("handles nested objects recursively", () => {
    const input = { outer_key: { inner_key: "value" } };
    const result = toCamelCase(input);
    expect(result).toEqual({ outerKey: { innerKey: "value" } });
  });

  test("handles arrays", () => {
    const input = [{ some_key: 1 }, { another_key: 2 }];
    const result = toCamelCase<Array<Record<string, number>>>(input);
    expect(result).toEqual([{ someKey: 1 }, { anotherKey: 2 }]);
  });

  test("handles null and undefined", () => {
    expect(toCamelCase(null)).toBeNull();
    expect(toCamelCase(undefined)).toBeUndefined();
  });

  test("passes through primitives", () => {
    expect(toCamelCase<number>(42)).toBe(42);
    expect(toCamelCase<string>("hello")).toBe("hello");
    expect(toCamelCase<boolean>(true)).toBe(true);
  });
});

describe("toSnakeCase", () => {
  test("converts object keys from camelCase to snake_case", () => {
    const input = { businessId: "123", businessName: "Test" };
    const result = toSnakeCase(input);
    expect(result).toEqual({ business_id: "123", business_name: "Test" });
  });

  test("handles nested objects recursively", () => {
    const input = { outerKey: { innerKey: "value" } };
    const result = toSnakeCase(input);
    expect(result).toEqual({ outer_key: { inner_key: "value" } });
  });
});

describe("parseJsonField", () => {
  test("parses valid JSON strings", () => {
    expect(parseJsonField<string[]>('["a","b"]')).toEqual(["a", "b"]);
    expect(parseJsonField<Record<string, string>>('{"key": "value"}')).toEqual({ key: "value" });
  });

  test("returns null for null/undefined/empty", () => {
    expect(parseJsonField(null)).toBeNull();
    expect(parseJsonField(undefined)).toBeNull();
    expect(parseJsonField("")).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    expect(parseJsonField("not json")).toBeNull();
  });
});
