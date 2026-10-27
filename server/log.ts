import { AsyncLocalStorage } from "node:async_hooks";

type RequestStore = {
  requestId: string;
};

const requestStore = new AsyncLocalStorage<RequestStore>();

export function withRequestId<T>(requestId: string, fn: () => T): T {
  return requestStore.run({ requestId }, fn);
}

export function log(
  level: "info" | "warn" | "error",
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const requestId = fields.requestId ?? requestStore.getStore()?.requestId;
  const rest = { ...fields };
  delete rest.requestId;
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...(requestId ? { requestId } : {}),
    ...rest,
  }));
}
