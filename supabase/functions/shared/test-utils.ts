// Shared testing utilities for Deno Edge Functions
export const mockFetch = (mockResponses: any[] | any, status = 200, isJson = true) => {
    const responses = Array.isArray(mockResponses) ? [...mockResponses] : [mockResponses];
    let callCount = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
        const data = responses[callCount] || responses[responses.length - 1];
        callCount++;

        const bodyContent = isJson ? JSON.stringify(data) : data;
        return new Response(bodyContent, {
            status,
            headers: isJson ? { 'Content-Type': 'application/json' } : undefined
        });
    };
    return () => { globalThis.fetch = originalFetch; };
};
