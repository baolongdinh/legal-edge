// Edge Function: summarize-conversation
// Description: Generate multi-layer summaries for conversations

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import { callLLM } from '../shared/types.ts';

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
    .map(m => `${m.role === 'user' ? 'Người dùng' : 'AI'}: ${m.content}`)
    .join('\n\n');

  const targetTokens = level === 1 ? 500 : level === 2 ? 1000 : 2000;
  const scope = level === 1 ? '10 tin nhắn gần nhất' : level === 2 ? '50 tin nhắn gần nhất' : 'toàn bộ cuộc trò chuyện';

  return `Hãy đóng vai một chuyên gia tóm tắt hồ sơ pháp lý. 
Dựa vào nội dung cuộc trò chuyện sau (${scope}), hãy tạo một bản tóm tắt súc tích, chuyên nghiệp bằng tiếng Việt.

Nội dung cuộc trò chuyện:
${conversationText}

Yêu cầu tóm tắt:
- Tập trung vào các chủ đề pháp lý chính.
- Liệt kê các câu hỏi nổi bật của người dùng và hướng giải quyết của AI.
- Ghi chú các kết luận pháp lý quan trọng (số hiệu văn bản, điều khoản nếu có).
- Liệt kê các vấn đề còn bỏ ngỏ hoặc cần tư vấn thêm (nếu có).
- Trình bày mạch lạc, sử dụng bullet points.
- Độ dài mục tiêu: Khoảng ${targetTokens} từ.

Tóm tắt:`;
}

// Summarize conversation
async function summarizeConversation(
  supabase: any,
  conversationId: string,
  level: 1 | 2 | 3
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
    console.warn(`[Summary] No messages found for conversation ${conversationId}`);
    return 'Chưa có đủ tin nhắn để tạo tóm tắt.';
  }

  // Reverse to get chronological order
  messages.reverse();

  // Build prompt and get summary via fallback-enabled LLM call
  const prompt = buildSummarizationPrompt(messages, level);
  const summary = await callLLM([
    { role: 'system', content: 'Bạn là chuyên gia phân tích và tóm tắt văn bản pháp lý.' },
    { role: 'user', content: prompt }
  ], {
    temperature: 0.3,
    maxTokens: 2000
  });

  if (!summary) {
    throw new Error('LLM returned empty summary');
  }

  // Determine which field to update
  const fieldName = level === 1 ? 'summary_level_1' :
    level === 2 ? 'summary_level_2' : 'summary_level_3';

  console.log(`[Summary] Attempting to update ${fieldName} for ${conversationId}. Length: ${summary.length}`);

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
    console.error(`[Summary] DATABASE UPDATE FAILED: ${updateError.message}`, updateError);
    throw new Error(`Failed to update conversation: ${updateError.message}`);
  }

  // Double check if update actually affected any row
  const { data: verify, error: verifyError } = await supabase
    .from('conversations')
    .select(fieldName)
    .eq('id', conversationId)
    .single();

  if (verifyError || !verify?.[fieldName]) {
    console.warn(`[Summary] Verification check failed or null column after update for ${conversationId}`);
  } else {
    console.log(`[Summary] Verification successful for ${conversationId}`);
  }

  return summary;
}

// Main handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabaseClient = createClient(
      supabaseUrl,
      serviceKey || (Deno.env.get('SUPABASE_ANON_KEY') ?? ''),
      {
        auth: { persistSession: false },
        global: { headers: authHeader ? { Authorization: authHeader } : undefined }
      }
    );

    const body: SummarizeRequest = await req.json();
    const { conversation_id, level } = body;

    if (!conversation_id || !level || ![1, 2, 3].includes(level)) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and level (1, 2, or 3) are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();
    console.log(`[Summary] Starting level ${level} for ${conversation_id}`);

    const summary = await summarizeConversation(supabaseClient, conversation_id, level);
    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        level,
        summary,
        summary_length: summary.length,
        duration_ms: duration
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Summary] Handler Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
