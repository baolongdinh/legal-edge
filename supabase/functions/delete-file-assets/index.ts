import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deleteFromCloudinary } from '../shared/cloudinary.ts'
import { corsHeaders, errorResponse, jsonResponse } from '../shared/types.ts'

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return errorResponse('Missing Authorization', 401)

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return errorResponse('Unauthorized', 401)

        const {
            contract_id,
            document_id,
            delete_contract = false,
            delete_document = false,
        } = await req.json()

        if (!contract_id && !document_id) {
            return errorResponse('Missing contract_id or document_id', 400)
        }

        let contract: any = null
        let document: any = null

        if (contract_id) {
            const { data, error } = await supabase
                .from('contracts')
                .select('id, user_id, document_id, pdf_public_id, pdf_provider, pdf_resource_type')
                .eq('id', contract_id)
                .eq('user_id', user.id)
                .maybeSingle()
            if (error) throw error
            if (!data) return errorResponse('Contract not found', 404)
            contract = data
        }

        const targetDocumentId = document_id || contract?.document_id
        if (targetDocumentId) {
            const { data, error } = await supabase
                .from('documents')
                .select('id, user_id, storage_object_key, storage_provider, storage_resource_type')
                .eq('id', targetDocumentId)
                .eq('user_id', user.id)
                .maybeSingle()
            if (error) throw error
            document = data
        }

        if (contract?.pdf_provider === 'cloudinary' && contract.pdf_public_id) {
            await deleteFromCloudinary({
                publicId: contract.pdf_public_id,
                resourceType: contract.pdf_resource_type ?? 'raw',
            })
        }

        if (document?.storage_provider === 'cloudinary' && document.storage_object_key) {
            await deleteFromCloudinary({
                publicId: document.storage_object_key,
                resourceType: document.storage_resource_type ?? 'raw',
            })
        }

        if (delete_contract && contract_id) {
            await supabase.from('contract_risks').delete().eq('contract_id', contract_id)
            await supabase.from('contract_chunks').delete().eq('contract_id', contract_id)
            const { error } = await supabase.from('contracts').delete().eq('id', contract_id).eq('user_id', user.id)
            if (error) throw error
        }

        if (delete_document && targetDocumentId) {
            const { error } = await supabase.from('documents').delete().eq('id', targetDocumentId).eq('user_id', user.id)
            if (error) throw error
        }

        return jsonResponse({
            ok: true,
            deleted_contract: Boolean(delete_contract && contract_id),
            deleted_document: Boolean(delete_document && targetDocumentId),
        })
    } catch (err) {
        return errorResponse((err as Error).message)
    }
})
