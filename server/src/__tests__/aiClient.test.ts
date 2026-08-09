import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiResponseParseError, parseJsonResponse } from "../ai/client.js";

const schema = z.object({ foo: z.number() });

describe("parseJsonResponse", () => {
  it("parses raw JSON", () => {
    expect(parseJsonResponse('{"foo": 1}', schema)).toEqual({ foo: 1 });
  });

  it("strips markdown code fences", () => {
    expect(parseJsonResponse('```json\n{"foo": 2}\n```', schema)).toEqual({ foo: 2 });
  });

  it("strips fences without a language tag", () => {
    expect(parseJsonResponse('```\n{"foo": 3}\n```', schema)).toEqual({ foo: 3 });
  });

  it("throws AiResponseParseError on invalid JSON", () => {
    expect(() => parseJsonResponse("not json", schema)).toThrow(AiResponseParseError);
  });

  it("throws AiResponseParseError when the shape doesn't match the schema", () => {
    expect(() => parseJsonResponse('{"foo": "not a number"}', schema)).toThrow(AiResponseParseError);
  });
});
