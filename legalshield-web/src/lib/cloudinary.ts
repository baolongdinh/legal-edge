/**
 * Cloudinary Upload Utility for LegalShield.
 * Uses unsigned upload preset for direct client-side uploads.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const API_KEY = import.meta.env.VITE_CLOUDINARY_API_KEY;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'ml_default';

export interface CloudinaryResponse {
    secure_url: string;
    public_id: string;
    format: string;
    width: number;
    height: number;
    bytes: number;
    resource_type: string;
}

/**
 * Uploads a file directly to Cloudinary using Unsigned Upload Preset.
 * @param file The file object from input.
 * @param folder Optional folder name in Cloudinary.
 * @param resourceType Resource type: 'image', 'raw' (for PDF, DOC, Excel, etc.), 'video', 'auto'
 */
export async function uploadToCloudinary(
    file: File,
    folder: string = 'chat_attachments',
    resourceType: 'image' | 'raw' | 'video' | 'auto' = 'auto'
): Promise<string> {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
        throw new Error('Cloudinary configuration missing (Cloud Name or Upload Preset)');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('api_key', API_KEY);

    // Note: Folder requires the preset to allow it in unsigned uploads
    if (folder) {
        formData.append('folder', folder);
    }

    try {
        // Determine resource type based on file type if 'auto'
        let actualResourceType = resourceType;
        if (resourceType === 'auto') {
            if (file.type.startsWith('image/')) {
                actualResourceType = 'image';
            } else if (file.type.startsWith('video/')) {
                actualResourceType = 'video';
            } else {
                actualResourceType = 'raw'; // PDF, DOC, Excel, etc.
            }
        }

        const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${actualResourceType}/upload`;

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            // DO NOT set Content-Type header; fetch will set it correctly for FormData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[Cloudinary] Upload failed:', errorData);
            throw new Error(errorData.error?.message || `Cloudinary upload failed with status ${response.status}`);
        }

        const data: CloudinaryResponse = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error('[Cloudinary] Error:', error);
        throw error;
    }
}
