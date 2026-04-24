// Edge Function: save-message
// Description: Save message to conversation and trigger summarization if needed

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

// Types
interface MessageRequest {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: any[];
  follow_up_suggestions?: string[];
  document_context?: any;
  token_count?: number;
  attachments?: {
    storage_path: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    metadata?: any;
  }[];
}

// Approximate token count
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Sanitize text to prevent PostgreSQL Unicode escape sequence errors
function sanitizeText(text: string): string {
  if (!text) return text;
  // Remove null bytes and other problematic characters
  return text.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// Trigger summarization if needed (fire-and-forget)
async function triggerSummarizationIfNeeded(
  supabase: any,
  conversationId: string,
  messageCount: number,
  totalTokens: number
): Promise<void> {
  let needsSummary = false;
  let summaryLevel: 1 | 2 | 3 = 1;

  // Trigger conditions
  if (messageCount >= 100) {
    needsSummary = true;
    summaryLevel = 3;
  } else if (messageCount >= 50) {
    needsSummary = true;
    summaryLevel = 2;
  } else if (messageCount >= 10) {
    needsSummary = true;
    summaryLevel = 1;
  }

  // Token-based trigger
  if (totalTokens >= 4000 && summaryLevel < 2) {
    needsSummary = true;
    summaryLevel = 2;
  }

  if (!needsSummary) {
    return;
  }

  // Fire-and-forget: don't await, don't block response
  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/summarize-conversation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      level: summaryLevel
    })
  }).catch(err => {
    console.warn('Summarization trigger failed:', err);
  });
}

// Main handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role to bypass algorithm issues in auth helper
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('User verification failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a user-scoped client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Parse request
    const body: MessageRequest = await req.json();
    const {
      conversation_id,
      role,
      content,
      citations,
      follow_up_suggestions,
      document_context,
      token_count,
      attachments = []
    } = body;

    // Validate required fields: content can be empty if there are attachments
    if (!conversation_id || !role || (!content && attachments.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'conversation_id, role, and content (or attachments) are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify conversation belongs to user
    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select('id, message_count, total_tokens, user_id')
      .eq('id', conversation_id)
      .eq('user_id', user.id)
      .single();

    if (convError || !conversation) {
      return new Response(
        JSON.stringify({ error: 'Conversation not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate token count if not provided
    const calculatedTokenCount = token_count ?? estimateTokens(content);

    // Sanitize content to prevent PostgreSQL Unicode errors
    const sanitizedContent = sanitizeText(content);

    // Insert message
    const { data: message, error: messageError } = await supabaseClient
      .from('messages')
      .insert({
        conversation_id,
        role,
        content: sanitizedContent,
        citations: citations || [],
        follow_up_suggestions: follow_up_suggestions || [],
        document_context: document_context || {},
        token_count: calculatedTokenCount
      })
      .select()
      .single();

    if (messageError) {
      console.error('Save message error:', messageError);
      return new Response(
        JSON.stringify({ error: 'Failed to save message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert attachments if provided
    if (attachments && attachments.length > 0) {
      const attachmentsToInsert = attachments.map(att => ({
        message_id: message.id,
        user_id: user.id,
        storage_path: att.storage_path,
        file_name: att.file_name,
        mime_type: att.mime_type,
        file_size: att.file_size,
        metadata: att.metadata || {}
      }));

      // Use user-scoped client - RLS policy now allows insertion via conversation ownership
      const { error: attachError } = await supabaseClient
        .from('message_attachments')
        .insert(attachmentsToInsert);

      if (attachError) {
        console.error('Failed to save message attachments:', attachError);
        // Return error since attachments are critical
        return new Response(
          JSON.stringify({ error: 'Failed to save attachments', detail: attachError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Update conversation stats
    const newMessageCount = (conversation.message_count || 0) + 1;
    const newTotalTokens = (conversation.total_tokens || 0) + calculatedTokenCount;

    const { error: updateError } = await supabaseClient
      .from('conversations')
      .update({
        message_count: newMessageCount,
        total_tokens: newTotalTokens,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversation_id);

    if (updateError) {
      console.warn('Failed to update conversation stats:', updateError);
    }

    // Update user profile stats
    const { error: profileError } = await supabaseClient
      .from('user_legal_profile')
      .upsert({
        user_id: user.id,
        total_tokens: newTotalTokens,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.warn('Failed to update user profile:', profileError);
    }

    // Trigger summarization if needed (fire-and-forget)
    triggerSummarizationIfNeeded(
      supabaseClient,
      conversation_id,
      newMessageCount,
      newTotalTokens
    );

    return new Response(
      JSON.stringify({
        success: true,
        message,
        conversation_stats: {
          message_count: newMessageCount,
          total_tokens: newTotalTokens
        }
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Handler error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
