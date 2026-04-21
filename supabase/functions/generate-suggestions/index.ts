// Edge Function: generate-suggestions
// Description: Generate follow-up question suggestions after AI response

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

// Types
interface SuggestionsRequest {
  user_message: string;
  ai_response: string;
  document_context?: any;
  conversation_id?: string;
  message_id?: string;
}

// Generate cache key from messages
function generateCacheKey(userMessage: string, aiResponse: string): string {
  const combined = `${userMessage}|${aiResponse}`;
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `suggestions:${Math.abs(hash)}`;
}

// Call Gemini for suggestions
async function callGeminiForSuggestions(
  userMessage: string,
  aiResponse: string,
  documentContext: any,
  apiKey: string
): Promise<string[]> {
  const docContextText = documentContext ?
    `\nTài liệu tham khảo: ${JSON.stringify(documentContext)}` : '';

  const prompt = `Dựa trên cuộc tư vấn pháp lý này, hãy tạo 3-4 câu hỏi tiếp theo mang tính "đào sâu" và "khơi gợi" để giúp người dùng hiểu rõ hơn về các rủi ro hoặc bước đi tiếp theo:

Câu hỏi của người dùng: ${userMessage}

Câu trả lời của AI: ${aiResponse}${docContextText}

Yêu cầu:
- Các câu hỏi ĐỪNG quá chung chung. Hãy tập trung vào:
  1. Các rủi ro tiềm ẩn chưa được nhắc tới.
  2. Các chứng cứ hoặc tài liệu cụ thể người dùng cần chuẩn bị.
  3. Các bước thủ tục hành chính/tố tụng tiếp theo.
  4. Giải thích sâu hơn về một điều luật cụ thể vừa trích dẫn.
- Ngôn ngữ: Tiếng Việt trang trọng.
- Mỗi câu hỏi trên một dòng riêng biệt.
- Câu hỏi phải kết thúc bằng dấu chấm hỏi (?).

Câu hỏi gợi ý (đào sâu):`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 500,
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Parse suggestions from response
  return text
    .split('\n')
    .map(line => {
      // Remove leading numbers and dots
      let cleaned = line.replace(/^\s*\d+[.\-)\]]\s*/, '').trim();
      // Remove "Câu hỏi gợi ý:" or similar prefixes
      cleaned = cleaned.replace(/^(Câu hỏi gợi ý[:：]\s*)/i, '');
      return cleaned;
    })
    .filter(line => {
      // Filter valid questions
      return line.length > 10 &&
        line.length < 200 &&
        line.endsWith('?') &&
        !line.includes('Ví dụ') &&
        !line.includes('câu hỏi');
    })
    .slice(0, 4);
}

// Main handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
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

    // Get Gemini API key (support plural rotation)
    const geminiKeysRaw = Deno.env.get('GEMINI_API_KEYS') || Deno.env.get('GEMINI_API_KEY') || '';
    const geminiKeys = geminiKeysRaw.split(',').map(k => k.trim()).filter(Boolean);

    if (geminiKeys.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Pick a random key for rotation
    const geminiApiKey = geminiKeys[Math.floor(Math.random() * geminiKeys.length)];

    // Check cache first (using Supabase cache table or Redis)
    const cacheKey = generateCacheKey(user_message, ai_response);
    let suggestions: string[] = [];
    let fromCache = false;

    try {
      // Try to get from cache
      const { data: cached } = await supabaseClient
        .from('semantic_cache')
        .select('response, created_at')
        .eq('cache_key', cacheKey)
        .single();

      if (cached && new Date(cached.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000) {
        suggestions = JSON.parse(cached.response);
        fromCache = true;
        console.log('Suggestions served from cache');
      }
    } catch {
      // Cache miss, continue to generate
    }

    // Generate suggestions if not cached
    if (suggestions.length === 0) {
      suggestions = await callGeminiForSuggestions(
        user_message,
        ai_response,
        document_context,
        geminiApiKey
      );

      // Cache the suggestions
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
          console.warn('Failed to cache suggestions:', cacheError);
        }
      }
    }

    // Update message with suggestions if message_id provided
    if (message_id) {
      try {
        await supabaseClient
          .from('messages')
          .update({ follow_up_suggestions: suggestions })
          .eq('id', message_id);
      } catch (updateError) {
        console.warn('Failed to update message with suggestions:', updateError);
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
    console.error('Suggestions generation error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        suggestions: [] // Return empty array on error
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
