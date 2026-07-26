import type { Static, TObject, TProperties, TSchema } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { ValueError } from "@sinclair/typebox/errors";

export class ContractValidationError extends Error {
  readonly name = "ContractValidationError";
}

export function closedObject<T extends TProperties>(properties: T): TObject<T> {
  return Type.Object(properties, { additionalProperties: false });
}

export function validateWithSchema<S extends TSchema>(
  schema: S,
  value: unknown,
): Static<S> {
  if (Value.Check(schema, value)) {
    return value as Static<S>;
  }

  const details = flattenErrors(Value.Errors(schema, value))
    .map((error) => `${error.path || "/"}: ${error.message}`)
    .join("; ");

  throw new ContractValidationError(details);
}

function flattenErrors(errors: Iterable<ValueError>): ValueError[] {
  const flattened: ValueError[] = [];

  for (const error of errors) {
    flattened.push(error);

    for (const nestedErrors of error.errors) {
      flattened.push(...flattenErrors(nestedErrors));
    }
  }

  return flattened;
}
