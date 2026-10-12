import { Type } from 'typebox';

/** Building blocks shared by every contract module. */
export const Uuid = Type.String({ format: 'uuid' });
export const Timestamp = Type.String({ format: 'date-time' });
/** Every client request and server response object forbids extra properties. */
export const strict = { additionalProperties: false } as const;
