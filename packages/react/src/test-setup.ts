// React's `act()` only flushes work when it knows it is running under a test.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
