import { z, type ZodType } from "zod";

const UInt16: ZodType<number> = z
  .number()
  .int()
  .min(0)
  .max(Math.pow(2, 16) - 1);

export const Port: ZodType<number> = z.coerce.number().pipe(UInt16);
