// Edge Function: save-conversation
// Description: Create, update, and delete conversations

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

// Types
interface ConversationRequest {
  action: 'create' | 'update' | 'delete';
  conversation_id?: string;
  title?: string;
  is_archived?: boolean;
  is_starred?: boolean;
  folder?: string;
}

// Generate default title from first message
function generateDefaultTitle(content: string): string {
  const cleaned = content.replace(/\s+/g, ' ').trim();
  return cleaned.length > 50 ? cleaned.substring(0, 47) + '...' : cleaned;
}

// Main handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role to bypass algorithm issues in auth helper
    // We will still verify the user's token manually
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

    // Create a user-scoped client if we want to honor RLS (optional, since we check user.id manually)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Parse request
    const body: ConversationRequest = await req.json();
    const { action, conversation_id, title, is_archived, is_starred, folder } = body;

    switch (action) {
      case 'create': {
        // Create new conversation
        const conversationTitle = title || 'Cuộc trò chuyện mới';

        const { data: conversation, error } = await supabaseClient
          .from('conversations')
          .insert({
            user_id: user.id,
            title: conversationTitle,
            is_archived: false,
            is_starred: false,
            folder: folder || null,
            message_count: 0,
            total_tokens: 0
          })
          .select()
          .single();

        if (error) {
          console.error('Create conversation error:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to create conversation' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update user's total conversations count
        await supabaseClient.rpc('increment_user_conversation_count', { p_user_id: user.id });

        return new Response(
          JSON.stringify({ success: true, conversation }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        if (!conversation_id) {
          return new Response(
            JSON.stringify({ error: 'Conversation ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Build update object with only provided fields
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (title !== undefined) updates.title = title;
        if (is_archived !== undefined) updates.is_archived = is_archived;
        if (is_starred !== undefined) updates.is_starred = is_starred;
        if (folder !== undefined) updates.folder = folder || null;

        const { data: conversation, error } = await supabaseClient
          .from('conversations')
          .update(updates)
          .eq('id', conversation_id)
          .eq('user_id', user.id) // RLS safety
          .select()
          .single();

        if (error) {
          console.error('Update conversation error:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to update conversation' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, conversation }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        if (!conversation_id) {
          return new Response(
            JSON.stringify({ error: 'Conversation ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Delete conversation (messages will be cascade deleted)
        const { error } = await supabaseClient
          .from('conversations')
          .delete()
          .eq('id', conversation_id)
          .eq('user_id', user.id); // RLS safety

        if (error) {
          console.error('Delete conversation error:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to delete conversation' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Conversation deleted' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('Handler error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
