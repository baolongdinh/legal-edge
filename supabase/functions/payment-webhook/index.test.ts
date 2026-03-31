import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { handler } from "./index.ts";
import { mockFetch } from "../shared/test-utils.ts";

Deno.test("payment-webhook handles MoMo success and applies credits", async () => {
    const req = new Request("http://localhost/functions/v1/payment-webhook?provider=momo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "order_123", resultCode: 0 })
    });

    const mockResponses = [
        { data: { id: "tx_1", order_id: "order_123", status: "pending", amount: 199000, user_id: "user_1" }, error: null }, // select transaction
        { data: [], error: null }, // update transactions (status success)
        { data: [], error: null }  // upsert subscriptions
    ];

    const restore = mockFetch(mockResponses);
    const res = await handler(req);
    restore();

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.message, "Webhook Processed");
});

Deno.test("payment-webhook is idempotent for already successful transactions", async () => {
    const req = new Request("http://localhost/functions/v1/payment-webhook?provider=momo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "order_already_done", resultCode: 0 })
    });

    const mockResponses = [
        { data: { id: "tx_done", status: "success" }, error: null }, // select transaction
    ];

    const restore = mockFetch(mockResponses);
    const res = await handler(req);
    restore();

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.message, "Idempotent - already processed");
});

Deno.test("payment-webhook handles VNPay failure", async () => {
    const req = new Request("http://localhost/functions/v1/payment-webhook?provider=vnpay&vnp_TxnRef=vnp_123&vnp_ResponseCode=99", {
        method: "GET"
    });

    const mockResponses = [
        { data: { id: "tx_vnp", status: "pending", order_id: "vnp_123" }, error: null }, // select transaction
        { data: [], error: null }, // update transactions (status failed)
    ];

    const restore = mockFetch(mockResponses);
    const res = await handler(req);
    restore();

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.RspCode, "00"); // VNPay expects 00 even if transaction failed at business level
});
