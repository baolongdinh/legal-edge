import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { handler } from "./index.ts";

Deno.test("vnpay-payment returns 401 without auth", async () => {
    const req = new Request("http://localhost/functions/v1/vnpay-payment", { method: "POST" });
    const res = await handler(req);
    assertEquals(res.status, 401);
});

Deno.test("vnpay-payment handles OPTIONS correctly", async () => {
    const req = new Request("http://localhost/functions/v1/vnpay-payment", { method: "OPTIONS" });
    const res = await handler(req);
    assertEquals(res.status, 200);
});
