import { describe, expect, it } from "vitest";
import { cssPath } from "./selector.ts";

describe("cssPath", () => {
  it("returns undefined for null", () => {
    expect(cssPath(null)).toBeUndefined();
  });

  it("uses the id when present (and stops there)", () => {
    document.body.innerHTML = `<div><span id="target">x</span></div>`;
    const el = document.getElementById("target");
    expect(cssPath(el)).toBe("span#target");
  });

  it("disambiguates same-tag siblings with :nth-of-type", () => {
    document.body.innerHTML = `<ul><li>a</li><li>b</li></ul>`;
    const second = document.querySelectorAll("li")[1]!;
    expect(cssPath(second)).toContain("li:nth-of-type(2)");
  });

  it("caps the path depth", () => {
    document.body.innerHTML = `<a><b><c><d><e><f><span>deep</span></f></e></d></c></b></a>`;
    const el = document.querySelector("span");
    const parts = cssPath(el)!.split(" > ");
    expect(parts.length).toBeLessThanOrEqual(5);
  });
});
