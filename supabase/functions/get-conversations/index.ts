// Edge Function: get-conversations
// Description: List user conversations with filtering and pagination

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

// Types
interface GetConversationsRequest {
  filter?: 'all' | 'starred' | 'archived';
  folder?: string;
  search?: string;
  page?: number;
  limit?: number;
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
    let body: GetConversationsRequest = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        // Invalid JSON, use defaults
      }
    } else if (req.method === 'GET') {
      const url = new URL(req.url);
      body = {
        filter: (url.searchParams.get('filter') as any) || 'all',
        folder: url.searchParams.get('folder') || undefined,
        search: url.searchParams.get('search') || undefined,
        page: parseInt(url.searchParams.get('page') || '1'),
        limit: parseInt(url.searchParams.get('limit') || '50')
      };
    }

    const {
      filter = 'all',
      folder,
      search,
      page = 1,
      limit = 50
    } = body;

    // Build query
    let query = supabaseClient
      .from('conversations')
      .select('*')
      .eq('user_id', user.id);

    // Apply filters
    switch (filter) {
      case 'starred':
        query = query.eq('is_starred', true);
        break;
      case 'archived':
        query = query.eq('is_archived', true);
        break;
      case 'all':
      default:
        // By default, exclude archived unless explicitly requested
        query = query.eq('is_archived', false);
        break;
    }

    // Apply folder filter
    if (folder) {
      query = query.eq('folder', folder);
    }

    // Apply search filter
    if (search && search.trim()) {
      query = query.or(`title.ilike.%${search}%`);
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    query = query
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Execute query
    const { data: conversations, error, count } = await query;

    if (error) {
      console.error('Fetch conversations error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch conversations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabaseClient
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      console.warn('Failed to get total count:', countError);
    }

    // Get unique folders for the user
    const { data: folders, error: foldersError } = await supabaseClient
      .from('conversations')
      .select('folder')
      .eq('user_id', user.id)
      .not('folder', 'is', null);

    if (foldersError) {
      console.warn('Failed to get folders:', foldersError);
    }

    const uniqueFolders = [...new Set(folders?.map(f => f.folder).filter(Boolean))];

    return new Response(
      JSON.stringify({
        success: true,
        conversations: conversations || [],
        pagination: {
          page,
          limit,
          total: totalCount || 0,
          has_more: (conversations?.length || 0) === limit
        },
        filters: {
          available_folders: uniqueFolders
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Handler error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
