import { supabaseAdmin } from '@/lib/supabase';
import { Search, Filter } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { FileList } from './file-list';

export const dynamic = 'force-dynamic';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface FileFolderData {
  id: string;
  original_file_name: string;
  parent_id: string | null;
}

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; folder?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const searchQuery = resolvedSearchParams.q || '';
  const currentPage = parseInt(resolvedSearchParams.page || '1', 10);
  const folderId = resolvedSearchParams.folder || '';
  const pageSize = 20;

  // 1. Prepare queries in parallel
  let currentFolderPromise = Promise.resolve<FileFolderData | null>(null);
  let breadcrumbsPromise = Promise.resolve<Array<BreadcrumbItem>>([]);

  if (folderId) {
    currentFolderPromise = Promise.resolve(
      supabaseAdmin
        .from('files')
        .select('id, original_file_name, parent_id')
        .eq('id', folderId)
        .single()
    )
      .then(({ data }) => (data as FileFolderData) || null)
      .catch(() => null);

    breadcrumbsPromise = Promise.resolve(
      supabaseAdmin
        .rpc('get_file_breadcrumbs', { folder_id: folderId })
    )
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to fetch breadcrumbs via RPC:', error);
          return [];
        }
        const rows = (data as Array<FileFolderData>) || [];
        return rows.map((row) => ({
          id: row.id,
          name: row.original_file_name,
        }));
      })
      .catch(() => []);
  }

  // 2. Fetch files with parts and account details
  let filesQuery = supabaseAdmin
    .from('files')
    .select(`
      id,
      original_file_name,
      mime_type,
      size,
      parent_id,
      created_at,
      thumbnail_url,
      preview_url,
      file_parts (
        id,
        part_number,
        size,
        google_drive_file_id,
        accounts (
          email
        )
      )
    `, { count: 'exact' })
    .order('mime_type', { ascending: false }) // Folders (mime_type: application/vnd.google-apps.folder) will sort to the top!
    .order('created_at', { ascending: false })
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  // Apply search query or folder navigation
  if (searchQuery) {
    // Global search across all directories
    filesQuery = filesQuery.ilike('original_file_name', `%${searchQuery}%`);
  } else {
    // Filter by folder hierarchy
    if (folderId) {
      filesQuery = filesQuery.eq('parent_id', folderId);
    } else {
      filesQuery = filesQuery.is('parent_id', null);
    }
  }

  // Run all database operations in parallel to minimize blocking network latencies
  const [currentFolder, breadcrumbs, filesResult] = await Promise.all([
    currentFolderPromise,
    breadcrumbsPromise,
    filesQuery,
  ]);

  const files = filesResult.data || [];
  const count = filesResult.count || 0;
  const totalPages = Math.ceil((count || 0) / pageSize);
  const folderQueryParam = folderId ? `&folder=${folderId}` : '';

  return (
    <div className="space-y-8 max-w-5xl mx-auto font-sans antialiased">
      {/* Title & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight text-black" style={{ letterSpacing: '-0.8px' }}>
            Files Manager
          </h1>
          <p className="text-[#5a5a5a] mt-1 text-sm font-heading font-bold">
            Access, download, and delete files distributed across your active Google accounts.
          </p>
        </div>
      </div>

      {/* Modern High Contrast Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <form method="GET" className="flex gap-3 w-full max-w-md">
          {folderId && <input type="hidden" name="folder" value={folderId} />}
          <div className="relative flex-1 group">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-[#5a5a5a] group-focus-within:text-black transition-colors" />
            <Input
              name="q"
              defaultValue={searchQuery}
              placeholder={folderId ? "Search in this folder..." : "Search files in pool..."}
              className="pl-10 pr-4 py-6 bg-canvas border-2 border-black text-black placeholder:text-[#5a5a5a] rounded-xl focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-black hover:bg-canvas/50 transition-all font-sans text-sm shadow-[3px_3px_0px_#000000]"
            />
          </div>
          <button 
            type="submit" 
            className="bg-black hover:bg-zinc-800 text-white border-2 border-black px-6 rounded-xl font-heading font-black text-sm shadow-[3px_3px_0px_rgba(0,0,0,0.2)] hover:translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_rgba(0,0,0,0.2)] active:translate-y-[1.5px] active:shadow-none cursor-pointer flex items-center justify-center gap-2 transition-all"
          >
            <Filter className="w-4 h-4" /> Filter
          </button>
        </form>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/files?q=${searchQuery}&page=${Math.max(1, currentPage - 1)}${folderQueryParam}`}
              className={`p-2 border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000] ${currentPage === 1 ? 'opacity-50 pointer-events-none' : 'hover:bg-surface-soft'}`}
            >
              Prev
            </Link>
            <span className="text-xs font-heading font-black px-3">
              Page {currentPage} of {totalPages}
            </span>
            <Link
              href={`/dashboard/files?q=${searchQuery}&page=${Math.min(totalPages, currentPage + 1)}${folderQueryParam}`}
              className={`p-2 border-2 border-black rounded-lg shadow-[2px_2px_0px_#000000] ${currentPage === totalPages ? 'opacity-50 pointer-events-none' : 'hover:bg-surface-soft'}`}
            >
              Next
            </Link>
          </div>
        )}
      </div>

      <FileList 
        initialFiles={files || []} 
        currentFolderId={folderId || null}
        currentFolderName={currentFolder ? currentFolder.original_file_name : null}
        breadcrumbs={breadcrumbs}
      />
    </div>
  );
}
