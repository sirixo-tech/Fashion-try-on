import {
  v7 as uuidv7,
  validate as validateUuid,
  version as uuidVersion,
} from "uuid";

export function createSelfxId(): string {
  return uuidv7();
}

export function isSelfxUuidV7(value: string): boolean {
  return validateUuid(value) && uuidVersion(value) === 7;
}
