import { HttpRequest } from "@azure/functions";
import { describe, expect, it } from "vitest";

import { parseSetCookie, toResponseInit, toWebRequest } from "./azure-http.ts";

describe("parseSetCookie", () => {
  it("keeps every attribute Auth.js sets", () => {
    expect(
      parseSetCookie(
        "authjs.session-token=abc.def; Path=/; Expires=Wed, 11 Nov 2026 10:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
      ),
    ).toEqual({
      name: "authjs.session-token",
      value: "abc.def",
      path: "/",
      expires: new Date("Wed, 11 Nov 2026 10:00:00 GMT"),
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
  });

  it("splits on the first '=' only and decodes the value once", () => {
    expect(parseSetCookie("authjs.csrf-token=a%7Cb==; Max-Age=0")).toEqual({
      name: "authjs.csrf-token",
      value: "a|b==",
      maxAge: 0,
    });
  });

  it("rejects a header with no name", () => {
    expect(parseSetCookie("=orphan; Path=/")).toBeNull();
  });
});

describe("toResponseInit", () => {
  it("moves every Set-Cookie into cookies and keeps the other headers", () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/");
    const init = toResponseInit(new Response("{}", { status: 201, headers }));

    expect(init.status).toBe(201);
    expect(init.cookies?.map((c) => c.name)).toEqual(["a", "b"]);
    expect(init.headers).toBeInstanceOf(Headers);
    const out = init.headers as Headers;
    expect(out.get("set-cookie")).toBeNull();
    expect(out.get("content-type")).toBe("application/json");
  });
});

describe("toWebRequest", () => {
  it("passes method, url, headers and body through", async () => {
    const req = toWebRequest(
      new HttpRequest({
        method: "POST",
        url: "https://api.example.com/ingest?x=1",
        headers: { "content-type": "text/plain", origin: "https://app.example.com" },
        body: { string: "hello" },
      }),
    );
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://api.example.com/ingest?x=1");
    expect(req.headers.get("origin")).toBe("https://app.example.com");
    expect(await req.text()).toBe("hello");
  });

  it("sends no body for GET", () => {
    const req = toWebRequest(new HttpRequest({ method: "GET", url: "https://api.example.com/health" }));
    expect(req.body).toBeNull();
  });
});
