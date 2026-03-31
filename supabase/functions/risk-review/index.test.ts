import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { handler } from "./index.ts";
import { mockFetch } from "../shared/test-utils.ts";

Deno.test("risk-review returns 401 unauthorized", async () => {
    const req = new Request("http://localhost/functions/v1/risk-review", { method: "POST" });
    const res = await handler(req);
    assertEquals(res.status, 401);
});

Deno.test("risk-review returns 400 for missing clause_text", async () => {
    const req = new Request("http://localhost/functions/v1/risk-review", {
        method: "POST",
        headers: { "Authorization": "Bearer fake" },
        body: JSON.stringify({})
    });

    // Mock user auth
    const restore = mockFetch({ data: { user: { id: "user123" } }, error: null });
    const res = await handler(req);
    assertEquals(res.status, 400);
    restore();
});

Deno.test("risk-review logic flow (fast mode)", async () => {
    const req = new Request("http://localhost/functions/v1/risk-review", {
        method: "POST",
        headers: { "Authorization": "Bearer fake", "Content-Type": "application/json" },
        body: JSON.stringify({ clause_text: "Điều khoản bồi thường", mode: "fast" })
    });

    const mockResponses = [
        { data: { user: { id: "user123" } }, error: null }, // auth.getUser
        { result: "allowed" }, // checkRateLimit (Upstash) -> assuming simple response for now
        { embedding: { values: [0.1, 0.2] } }, // embedText (Gemini)
        [], // rpc('find_semantic_match') -> miss
        { // fetch(GEMINI_URL)
            candidates: [{
                content: {
                    parts: [{
                        text: JSON.stringify({
                            risks: [{ clause_ref: "Điều 5", level: "moderate", description: "Rủi ro bồi thường", citation: "LS 2024" }]
                        })
                    }]
                }
            }]
        },
        { status: 201 } // semantic_cache insert
    ];

    const restore = mockFetch(mockResponses);
    const res = await handler(req);
    restore();

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.risks[0].level, "moderate");
    assertEquals(data.risks[0].clause_ref, "Điều 5");
});
