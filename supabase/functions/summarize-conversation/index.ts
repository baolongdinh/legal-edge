// Edge Function: summarize-conversation
// Description: Generate multi-layer summaries for conversations

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

// Types
interface SummarizeRequest {
  conversation_id: string;
  level: 1 | 2 | 3;
}

// Approximate token count
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Build summarization prompt
function buildSummarizationPrompt(messages: any[], level: number): string {
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');

  const targetTokens = level === 1 ? 500 : level === 2 ? 1000 : 2000;
  const scope = level === 1 ? '10 tin nhắn gần nhất' : level === 2 ? '50 tin nhắn gần nhất' : 'toàn bộ cuộc trò chuyện';

  return `Hãy tóm tắt cuộc tư vấn pháp lý này (${scope}):

${conversationText}

Yêu cầu tóm tắt:
- Tập trung vào các chủ đề pháp lý chính
- Liệt kê các câu hỏi và câu trả lời quan trọng
- Ghi chú các kết luận pháp lý quan trọng
- Liệt kê các vấn đề chưa được giải quyết (nếu có)
- Đề cập các tài liệu tham khảo (nếu có)
- Tóm tắt bằng tiếng Việt

Mục tiêu: Khoảng ${targetTokens} tokens\n
Tóm tắt:`;
}

// Call Gemini for summarization
async function callGeminiForSummary(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Summarize conversation
async function summarizeConversation(
  supabase: any,
  conversationId: string,
  level: 1 | 2 | 3,
  geminiApiKey: string
): Promise<string> {
  // Determine message limit based on level
  const messageLimit = level === 1 ? 10 : level === 2 ? 50 : 1000;

  // Fetch messages
  const { data: messages, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(messageLimit);

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  if (!messages || messages.length === 0) {
    throw new Error('No messages found for summarization');
  }

  // Reverse to get chronological order
  messages.reverse();

  // Build prompt and get summary
  const prompt = buildSummarizationPrompt(messages, level);
  const summary = await callGeminiForSummary(prompt, geminiApiKey);

  // Determine which field to update
  const fieldName = level === 1 ? 'summary_level_1' :
    level === 2 ? 'summary_level_2' : 'summary_level_3';

  // Update conversation
  const { error: updateError } = await supabase
    .from('conversations')
    .update({
      [fieldName]: summary,
      summary_last_updated: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', conversationId);

  if (updateError) {
    throw new Error(`Failed to update conversation: ${updateError.message}`);
  }

  return summary;
}

// Main handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role for background operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Parse request
    const body: SummarizeRequest = await req.json();
    const { conversation_id, level } = body;

    if (!conversation_id || !level || ![1, 2, 3].includes(level)) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and level (1, 2, or 3) are required' }),
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

    // Perform summarization
    const startTime = Date.now();
    const summary = await summarizeConversation(supabaseClient, conversation_id, level, geminiApiKey);
    const duration = Date.now() - startTime;

    console.log(`Summarization Level ${level} completed for conversation ${conversation_id} in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        level,
        summary_length: summary.length,
        estimated_tokens: estimateTokens(summary),
        duration_ms: duration
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Summarization error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
