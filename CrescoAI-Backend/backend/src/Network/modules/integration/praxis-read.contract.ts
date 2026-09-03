import Ajv2020 from 'ajv/dist/2020.js';
import errorSchema from './contracts/cresco-error-response.schema.json';
import openTargetSchema from './contracts/cresco-open-target.schema.json';
import responseSchema from './contracts/cresco-read-response.schema.json';

// The frozen schema uses conditional fragments whose type is established by
// the referenced parent schema. Ajv's strictTypes lint rejects that valid
// composition, so keep standards validation on while disabling that lint.
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat('date-time', {
  type: 'string',
  validate(value: string) {
    return (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) && Number.isFinite(Date.parse(value))
    );
  },
});
ajv.addSchema(openTargetSchema);

const validateResponse = ajv.compile(responseSchema);
const validateError = ajv.compile(errorSchema);

export function isPraxisReadResponse(value: unknown): boolean {
  return validateResponse(value);
}

export function isPraxisReadErrorResponse(value: unknown): boolean {
  return validateError(value);
}
