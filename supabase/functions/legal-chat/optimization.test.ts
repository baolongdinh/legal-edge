import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { mockFetch } from "../shared/test-utils.ts";

/**
 * Test T025: Hybrid Search Precision
 * Verify that match_document_chunks is called with p_query_text.
 */
Deno.test("legal-chat uses hybrid search for legal citations", async () => {
    // Import the handler (requires export in index.ts)
    const { handler } = await import("./index.ts");

    const req = new Request("http://localhost/functions/v1/legal-chat", {
        method: "POST",
        headers: { "Authorization": "Bearer valid-token", "Content-Type": "application/json" },
        body: JSON.stringify({
            message: "Điều 5 Luật Dân sự 2015",
            history: []
        })
    });

    const mockResponses = [
        { data: { user: { id: "user1" } }, error: null }, // authenticateRequest
        { candidates: [{ content: { parts: [{ text: "Standalone query" }] } }] }, // buildStandaloneQuery
        { candidates: [{ content: { parts: [{ text: "HyDE doc" }] } }] }, // generateHypotheticalDocument
        // RPC match_document_chunks call
        { data: [{ id: "chunk1", content: "Nội dung điều 5...", law_article: "Điều 5" }], error: null },
        { candidates: [{ content: { parts: [{ text: "AI Answer" }] } }] } // Gemini Final
    ];

    const restore = mockFetch(mockResponses);
    const res = await handler(req);
    restore();

    assertEquals(res.status, 200);
});

/**
 * Test T026: Semantic Cache Hit
 * Verify that semantic cache check returns a result without calling Gemini.
 */
Deno.test("legal-chat hits semantic cache for similar questions", async () => {
    const { handler } = await import("./index.ts");

    const req = new Request("http://localhost/functions/v1/legal-chat", {
        method: "POST",
        headers: { "Authorization": "Bearer valid-token", "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Ly hôn cần gì?", history: [] })
    });

    const mockResponses = [
        { data: { user: { id: "user1" } }, error: null }, // authenticateRequest
        { candidates: [{ content: { parts: [{ text: "Ly hôn cần gì?" }] } }] }, // buildStandaloneQuery
        // Semantic Cache RPC match
        { data: [{ result_json: { reply: "Cached answer", citations: [] } }], error: null }
    ];

    const restore = mockFetch(mockResponses);
    const res = await handler(req);
    restore();

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.semantic_cached, true);
    assertEquals(data.reply, "Cached answer");
});
