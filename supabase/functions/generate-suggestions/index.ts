import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import { callLLM } from '../shared/types.ts';

// Types
interface SuggestionsRequest {
  user_message: string;
  ai_response: string;
  document_context?: any;
  conversation_id?: string;
  message_id?: string;
}

// Generate cache key from messages + conversation_id + document context
function generateCacheKey(userMessage: string, aiResponse: string, conversationId?: string, documentContext?: any): string {
  // Include conversation_id and document context to ensure each context has unique suggestions
  const docContextStr = documentContext
    ? (typeof documentContext === 'string' ? documentContext.slice(0, 100) : JSON.stringify(documentContext).slice(0, 100))
    : 'no-doc'
  const combined = `${conversationId || 'global'}|${userMessage.slice(0, 100)}|${aiResponse.slice(0, 100)}|${docContextStr}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `suggestions:${Math.abs(hash)}`;
}

// Main handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || (Deno.env.get('SUPABASE_ANON_KEY') ?? ''),
      {
        auth: { persistSession: false },
        global: { headers: authHeader ? { Authorization: authHeader } : undefined }
      }
    );

    const body: SuggestionsRequest = await req.json();
    const {
      user_message,
      ai_response,
      document_context,
      conversation_id,
      message_id
    } = body;

    if (!user_message || !ai_response) {
      return new Response(
        JSON.stringify({ error: 'user_message and ai_response are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache first
    const cacheKey = generateCacheKey(user_message, ai_response, conversation_id, document_context);
    let suggestions: string[] = [];
    let fromCache = false;

    try {
      const { data: cached } = await supabaseClient
        .from('semantic_cache')
        .select('response, created_at')
        .eq('cache_key', cacheKey)
        .single();

      if (cached && new Date(cached.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000) {
        suggestions = JSON.parse(cached.response);
        fromCache = true;
        console.log(`[Suggestions] Cache hit for ${cacheKey}`);
      }
    } catch {
      // Cache miss
    }

    // Generate suggestions if not cached
    if (suggestions.length === 0) {
      console.log(`[Suggestions] Generating new suggestions for ${conversation_id || 'unknown'}`);

      const docContextText = document_context ?
        `\nTài liệu liên quan: ${typeof document_context === 'string' ? document_context : JSON.stringify(document_context)}` : '';

      const prompt = `Dựa trên cuộc tư vấn pháp lý này, hãy tạo 3-4 câu hỏi mà NGƯỜI DÙNG có khả năng sẽ đặt ra tiếp theo để đào sâu vào câu trả lời của AI.

CÂU HỎI CỦA NGƯỜI DÙNG:
${user_message}

CÂU TRẢ LỜI CỦA AI:
${ai_response}
${docContextText}

Yêu cầu QUAN TRỌNG:
- Các câu hỏi phải được viết dưới góc nhìn của NGƯỜI DÙNG (ngôi thứ nhất, xưng "Tôi", "Làm thế nào để tôi...", "Tôi cần chuẩn bị gì...", v.v.).
- Câu hỏi phải mang tính "đào sâu" vào các chi tiết mà AI vừa trả lời (ví dụ: hỏi về thủ tục cụ thể, rủi ro cụ thể, hoặc bằng chứng cần thiết).
- Nếu AI trả lời về hợp đồng/văn bản, hãy gợi ý câu hỏi về các điều khoản, rủi ro, hoặc thủ tục liên quan.
- KHÔNG để AI hỏi ngược lại người dùng theo kiểu "Bạn có muốn...". Hãy để người dùng là người chủ động đặt câu hỏi.
- Ngôn ngữ: Tiếng Việt trang trọng, chuyên nghiệp.
- Định dạng: Mỗi câu hỏi trên một dòng riêng biệt, không có số thứ tự ở đầu.
- Mỗi câu phải kết thúc bằng dấu hỏi (?).
- KHÔNG bao gồm văn bản dẫn nhập hay kết luận.

Câu hỏi người dùng muốn đặt tiếp theo:`;

      const responseText = await callLLM([
        { role: 'system', content: 'Bạn là chuyên gia tư vấn pháp lý tài ba, luôn biết cách đặt câu hỏi gợi mở để làm rõ vấn đề.' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.7,
        maxTokens: 500
      });

      suggestions = responseText
        .split('\n')
        .map(line => line.replace(/^\s*[-•\d.]+\s*/, '').trim()) // Clear bullet points/numbers
        .filter(line => line.length > 10 && line.endsWith('?'))
        .slice(0, 4);

      if (suggestions.length > 0) {
        try {
          await supabaseClient
            .from('semantic_cache')
            .upsert({
              cache_key: cacheKey,
              response: JSON.stringify(suggestions),
              created_at: new Date().toISOString()
            }, { onConflict: 'cache_key' });
        } catch (cacheError) {
          console.warn('[Suggestions] Cache save failed:', cacheError);
        }
      }
    }

    // Update message persistence
    if (message_id && suggestions.length > 0) {
      console.log(`[Suggestions] Persisting ${suggestions.length} suggestions to message ${message_id}`);
      const { error: updateError } = await supabaseClient
        .from('messages')
        .update({ follow_up_suggestions: suggestions })
        .eq('id', message_id);

      if (updateError) {
        console.error(`[Suggestions] DATABASE UPDATE FAILED for message ${message_id}: ${updateError.message}`);
      } else {
        console.log(`[Suggestions] Successfully updated message ${message_id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        suggestions,
        count: suggestions.length,
        from_cache: fromCache
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Suggestions] Handler Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        suggestions: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
