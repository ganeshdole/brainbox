import { describe, expect, it } from "vitest";
import { createWidgetStore } from "./widget-store.ts";

describe("widget store", () => {
  it("opens on start() and hands the mode over once", () => {
    const store = createWidgetStore();
    let changes = 0;
    store.subscribe(() => (changes += 1));

    store.start("record");
    expect(store.isOpen()).toBe(true);
    expect(changes).toBe(1);
    expect(store.takeStart()).toBe("record");
    expect(store.takeStart()).toBeNull();
  });

  it("tells the widget about start() while it is already open on the chooser", () => {
    const store = createWidgetStore();
    store.open();
    let changes = 0;
    store.subscribe(() => (changes += 1));

    store.start("screenshot");
    expect(changes).toBe(1);
    expect(store.takeStart()).toBe("screenshot");
  });

  it("forgets an unread mode when closed, so the next open() shows the chooser", () => {
    const store = createWidgetStore();
    store.start("screenshot");
    store.close();
    store.open();
    expect(store.takeStart()).toBeNull();
  });
});
