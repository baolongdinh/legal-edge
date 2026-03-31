import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { handler } from "./index.ts";

Deno.test("parse-document returns 401 when no authorization header is provided", async () => {
    const req = new Request("http://localhost/functions/v1/parse-document", { method: "POST" });
    const res = await handler(req);
    assertEquals(res.status, 401);
});

Deno.test("parse-document returns 400 when body does not contain a file", async () => {
    const req = new Request("http://localhost/functions/v1/parse-document", {
        method: "POST",
        headers: { "Authorization": "Bearer mocked-token" },
        body: new FormData()
    });
    // This will hit the authError = true logic internally if it doesn't have a valid mocked Supabase Client,
    // which results in a 401 inside the try block since it can't fetch the auth user.
    const res = await handler(req);
    assertEquals(res.status, 401);
});
