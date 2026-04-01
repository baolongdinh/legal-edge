const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? ''
const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY') ?? ''
const CLOUDINARY_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') ?? ''
const CLOUDINARY_UPLOAD_PREFIX = (Deno.env.get('CLOUDINARY_UPLOAD_PREFIX') ?? 'https://api.cloudinary.com').replace(/\/$/, '')

export interface CloudinaryUploadResult {
    secure_url: string
    public_id: string
    resource_type: 'image' | 'raw' | 'video'
    bytes?: number
    format?: string
    original_filename?: string
}

function ensureCloudinaryEnv() {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
        throw new Error('Missing Cloudinary env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET')
    }
}

function sanitizeSegment(input: string): string {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'file'
}

function stripFileExtension(filename: string): string {
    return filename.replace(/\.[^.]+$/, '')
}

function toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha1Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input))
    return toHex(digest)
}

export function getCloudinaryResourceType(mimeType: string): 'image' | 'raw' | 'video' {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return 'video'
    return 'raw'
}

export async function uploadToCloudinary(params: {
    file: Uint8Array
    fileName: string
    mimeType: string
    publicIdPrefix: string
}): Promise<CloudinaryUploadResult> {
    ensureCloudinaryEnv()

    const resourceType = getCloudinaryResourceType(params.mimeType)
    const baseName = resourceType === 'raw'
        ? sanitizeSegment(params.fileName)
        : sanitizeSegment(stripFileExtension(params.fileName))
    const publicId = `${params.publicIdPrefix.replace(/^\/+|\/+$/g, '')}/${baseName}`
    const timestamp = Math.floor(Date.now() / 1000).toString()

    const signatureBase = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`
    const signature = await sha1Hex(signatureBase)

    const form = new FormData()
    form.append('file', new Blob([params.file], { type: params.mimeType }), params.fileName)
    form.append('api_key', CLOUDINARY_API_KEY)
    form.append('timestamp', timestamp)
    form.append('signature', signature)
    form.append('public_id', publicId)

    const response = await fetch(
        `${CLOUDINARY_UPLOAD_PREFIX}/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
        {
            method: 'POST',
            body: form,
        }
    )

    if (!response.ok) {
        throw new Error(`Cloudinary upload failed: ${await response.text()}`)
    }

    return await response.json() as CloudinaryUploadResult
}

export async function deleteFromCloudinary(params: {
    publicId: string
    resourceType?: 'image' | 'raw' | 'video'
    invalidate?: boolean
}) {
    ensureCloudinaryEnv()

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const invalidate = params.invalidate !== false
    const resourceType = params.resourceType ?? 'raw'
    const signatureBase = [
        invalidate ? 'invalidate=true' : '',
        `public_id=${params.publicId}`,
        `timestamp=${timestamp}`,
    ].filter(Boolean).join('&') + CLOUDINARY_API_SECRET
    const signature = await sha1Hex(signatureBase)

    const form = new FormData()
    form.append('api_key', CLOUDINARY_API_KEY)
    form.append('timestamp', timestamp)
    form.append('signature', signature)
    form.append('public_id', params.publicId)
    if (invalidate) {
        form.append('invalidate', 'true')
    }

    const response = await fetch(
        `${CLOUDINARY_UPLOAD_PREFIX}/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`,
        {
            method: 'POST',
            body: form,
        }
    )

    if (!response.ok) {
        throw new Error(`Cloudinary destroy failed: ${await response.text()}`)
    }

    return await response.json()
}
