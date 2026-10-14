import { getStore } from "../src/store/index.ts";
import { describeStoreConformance } from "../src/testing/store-conformance.ts";
import { TEST_STORE } from "./env.ts";

// The store this suite runs against (TEST_STORE), straight through the Store
// interface. setup.ts empties it before every test.
describeStoreConformance(TEST_STORE === "convex" ? "Convex" : "Postgres", { store: getStore });
