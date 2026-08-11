import assert from "node:assert/strict";

import { createSelfxId, isSelfxUuidV7 } from "./uuid.js";

const generatedIds = Array.from({ length: 100 }, () => createSelfxId());

for (const id of generatedIds) {
  assert.equal(isSelfxUuidV7(id), true, `${id} must be a valid UUIDv7`);
}

assert.equal(
  new Set(generatedIds).size,
  generatedIds.length,
  "UUIDv7 IDs must be unique",
);

console.log("UUIDv7 generation verified");
