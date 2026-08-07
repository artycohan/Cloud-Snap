import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { compressImage } from '@/utils/compressImage';

// Run in Node.js runtime to support image compression using sharp
export const runtime = 'edge';
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const customFilename = formData.get('custom_filename') as string | null;
        const folder = (formData.get('folder') as string) || 'default';

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Validate file type
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (!isImage && !isVideo) {
            return NextResponse.json(
                { error: 'Only image and video files are allowed' },
                { status: 400 }
            );
        }

        // Validate file size (max 100MB for images, 500MB for videos)
        const maxSize = isVideo ? 500 * 1024 * 1024 : 100 * 1024 * 1024;
        if (file.size > maxSize) {
            return NextResponse.json(
                { error: `File size must be less than ${isVideo ? '500MB' : '100MB'}` },
                { status: 400 }
            );
        }

        // Parse quality and max_dim if provided
        const qualityStr = formData.get('quality') as string | null;
        const maxDimStr = formData.get('max_dim') as string | null;
        const quality = qualityStr ? parseInt(qualityStr, 10) : 82;
        const maxDim = maxDimStr ? parseInt(maxDimStr, 10) : 2048;

        // Convert file to buffer and optionally compress
        let fileBuffer: Buffer = Buffer.from(await file.arrayBuffer());
        let finalFilename = file.name;
        let finalMimeType = file.type;
        let finalSize = file.size;

        if (file.type.startsWith('image/')) {
            try {
                const result = await compressImage(fileBuffer, file.name, quality, maxDim);
                fileBuffer = result.buffer;
                finalFilename = result.filename;
                finalMimeType = result.mimeType;
                finalSize = result.size;
            } catch (err) {
                console.error('Image compression failed, using original file:', err);
            }
        }

        const base64Content = fileBuffer.toString('base64');

        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN,
        });

        // Generate unique filename
        const extension = finalFilename.split('.').pop() || 'jpg';
        const cleanFolder = folder.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_\/-]/g, '-'); // Sanitize folder
        const destinationFolder = `src/assets/${cleanFolder}`;
        let filename: string;

        if (customFilename) {
            // Use custom filename, sanitize it
            const sanitized = customFilename.replace(/[^a-zA-Z0-9_-]/g, '-');
            filename = `${destinationFolder}/${sanitized}.${extension}`;
        } else {
            // Generate automatic filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            filename = `${destinationFolder}/${timestamp}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
        }

        // Upload to GitHub
        const response = await octokit.repos.createOrUpdateFileContents({
            owner: process.env.GITHUB_OWNER!,
            repo: process.env.GITHUB_REPO!,
            path: filename,
            message: `Upload image: ${finalFilename}`,
            content: base64Content,
            branch: process.env.GITHUB_BRANCH || 'main',
        });


        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const branch = process.env.GITHUB_BRANCH || 'main';
        if (!owner || !repo || !branch) {
            return NextResponse.json({
                error: 'GitHub repository configuration is missing. Please set GITHUB_OWNER, GITHUB_REPO, and GITHUB_BRANCH in your environment.'
            }, { status: 500 });
        }
        const commitSha = response.data.commit.sha;

        // Generate all URL types
        const urls = {
            // Branch-based URLs
            github: `https://github.com/${owner}/${repo}/blob/${branch}/${filename}`,
            raw: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filename}`,
            jsdelivr: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${filename}`,

            // Commit-based URLs (permanent)
            github_commit: `https://github.com/${owner}/${repo}/blob/${commitSha}/${filename}`,
            raw_commit: `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${filename}`,
            jsdelivr_commit: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${commitSha}/${filename}`,
        };

        return NextResponse.json({
            success: true,
            url: urls.raw, // Default URL for backward compatibility
            urls: urls,
            filename: filename,
            size: finalSize,
            type: finalMimeType,
            commit_sha: commitSha,
            github_url: response.data.content?.html_url,
        });

    } catch (error) {
        console.error('Upload error:', error);

        if (error instanceof Error) {
            return NextResponse.json(
                { error: `Upload failed: ${error.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { error: 'Upload failed: Unknown error' },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'Image upload API endpoint',
        methods: ['POST'],
        maxFileSize: '100MB',
        allowedTypes: ['image/*'],
    });
}
