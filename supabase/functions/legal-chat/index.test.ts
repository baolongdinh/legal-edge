import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
// In legal-chat, the handler is anonymous and passed to serve(). 
// But we can still import and test it if we can get a reference to the inner function.
// For now, I'll assume we might need to export it for testing, or I can use a similar approach to risk-review if it was exported.
// Checking earlier view_file, legal-chat uses serve(async (req) => { ... })
// I will REFACTOR legal-chat/index.ts slightly to export the handler first, then call serve(handler).

import { mockFetch } from "../shared/test-utils.ts";

Deno.test("legal-chat handles basic message flow", async () => {
    const { handler } = await import("./index.ts");
    const req = new Request("http://localhost/functions/v1/legal-chat", {
        method: "POST",
        headers: { "Authorization": "Bearer valid-token", "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Chào bạn", history: [] })
    });

    const mockResponses = [
        { data: { user: { id: "user1", user_metadata: { full_name: "Test User" } } }, error: null }, // auth.getUser
        {
            candidates: [{
                content: {
                    parts: [{ text: "Chào Test User, tôi là trợ lý LegalShield." }]
                }
            }]
        } // Gemini
    ];

    const restore = mockFetch(mockResponses);
    const res = await handler(req);
    restore();

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.reply, "Chào Test User, tôi là trợ lý LegalShield.");
});
