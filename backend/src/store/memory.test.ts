import { describeStoreConformance } from "../testing/store-conformance.ts";
import { createMemoryStore } from "./memory.ts";

let store = createMemoryStore();

describeStoreConformance("In-memory", {
  store: () => store,
  reset: async () => {
    store = createMemoryStore();
  },
});
