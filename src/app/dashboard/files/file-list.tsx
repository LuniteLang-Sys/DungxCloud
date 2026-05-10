'use client';

import { useState, useMemo } from 'react';
import { 
  FileDown, 
  HardDrive, 
  Copy, 
  Pencil, 
  Check, 
  X, 
  Trash2, 
  Loader2, 
  LayoutGrid, 
  List as ListIcon,
  MoreVertical,
  Eye,
  FolderPlus,
  FilePlus,
  ChevronRight,
  Folder
} from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { getFileIconInfo } from '@/lib/file-icons';
import dynamicLoader from 'next/dynamic';

const PreviewDialog = dynamicLoader(() => import('./preview-dialog').then(mod => mod.PreviewDialog), {
  ssr: false,
  loading: () => null
});

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import { Input } from '@/components/ui/input';

interface FileListProps {
  initialFiles: any[];
  currentFolderId?: string | null;
  currentFolderName?: string | null;
  breadcrumbs?: Array<{ id: string; name: string }>;
}

export function FileList({ 
  initialFiles, 
  currentFolderId = null, 
  currentFolderName = null, 
  breadcrumbs = [] 
}: FileListProps) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState<string>('');
  const [isRenaming, setIsRenaming] = useState(false);
  
  const [sortField, setSortField] = useState<'created_at' | 'size' | 'original_file_name'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [previewFile, setPreviewFile] = useState<any | null>(null);

  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Drag and Drop States
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Dialog States
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const [isCreateTextOpen, setIsCreateTextOpen] = useState(false);
  const [textFileName, setTextFileName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [isCreatingText, setIsCreatingText] = useState(false);

  // Sync files if parent re-fetches
  useMemo(() => {
    setFiles(initialFiles);
  }, [initialFiles]);

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const toggleAll = () => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map(f => f.id)));
    }
  };

  const handleCopyLink = (fileId: string) => {
    const url = `${window.location.origin}/dashboard/download/${fileId}`;
    navigator.clipboard.writeText(url);
    toast.success('Download link copied to clipboard!');
  };

  const handleDelete = async (fileId: string) => {
    try {
      const res = await fetch(`/api/files/${fileId}/delete`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to delete file');
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(fileId);
        return newSet;
      });
      toast.success('Item deleted successfully');
      router.refresh();
    } catch (error: any) {
      toast.error('Failed to delete item');
    }
  };

  const handleRenameSubmit = async (fileId: string) => {
    if (!newName.trim()) {
      setRenamingId(null);
      return;
    }

    try {
      setIsRenaming(true);
      const res = await fetch(`/api/files/${fileId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });

      if (!res.ok) throw new Error('Failed to rename item');

      // Optimistic update
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, original_file_name: newName } : f));
      toast.success('Item renamed successfully');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsRenaming(false);
      setRenamingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkConfirming) {
      setBulkConfirming(true);
      setTimeout(() => setBulkConfirming(false), 4000);
      return;
    }

    try {
      setIsBulkDeleting(true);
      const deletePromises = Array.from(selectedIds).map(id => 
        fetch(`/api/files/${id}/delete`, { method: 'POST' })
      );
      
      await Promise.all(deletePromises);
      
      toast.success(`${selectedIds.size} items deleted successfully!`);
      setSelectedIds(new Set());
      router.refresh();
    } catch (error: any) {
      toast.error('Failed to delete some items.');
    } finally {
      setIsBulkDeleting(false);
      setBulkConfirming(false);
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, fileId: string) => {
    e.dataTransfer.setData('text/plain', fileId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = (e: React.DragEvent, folderId: string) => {
    if (dragOverFolderId === folderId) {
      setDragOverFolderId(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDragOverFolderId(null);

    const draggedFileId = e.dataTransfer.getData('text/plain');
    if (!draggedFileId) return;

    if (draggedFileId === targetFolderId) {
      toast.error('Cannot move a folder inside itself');
      return;
    }

    try {
      const res = await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: draggedFileId, parentId: targetFolderId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to move item');
      }

      toast.success('Moved item successfully!');
      // Optimistic update
      setFiles(prev => prev.filter(f => f.id !== draggedFileId));
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(draggedFileId);
        return newSet;
      });
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Creating Folder Handler
  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    try {
      setIsCreatingFolder(true);
      const res = await fetch('/api/files/create-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, parentId: currentFolderId }),
      });

      if (!res.ok) throw new Error('Failed to create folder');
      const newFolder = await res.json();

      setFiles(prev => [newFolder, ...prev]);
      setFolderName('');
      setIsCreateFolderOpen(false);
      toast.success('Folder created successfully!');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Creating Text File Handler
  const handleCreateTextFile = async () => {
    if (!textFileName.trim()) {
      toast.error('File name is required');
      return;
    }
    try {
      setIsCreatingText(true);
      const res = await fetch('/api/files/create-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: textFileName, 
          content: textContent, 
          parentId: currentFolderId 
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create text file');
      }

      const newTextFile = await res.json();
      setFiles(prev => [newTextFile, ...prev]);
      setTextFileName('');
      setTextContent('');
      setIsCreateTextOpen(false);
      toast.success('Text file created and saved on Google Drive!');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsCreatingText(false);
    }
  };

  // Sorting logic
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      // Folders always sort to the top, regardless of order
      const isFolderA = a.mime_type === 'application/vnd.google-apps.folder';
      const isFolderB = b.mime_type === 'application/vnd.google-apps.folder';
      
      if (isFolderA && !isFolderB) return -1;
      if (!isFolderA && isFolderB) return 1;

      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'original_file_name') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      } else if (sortField === 'created_at') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [files, sortField, sortOrder]);

  const FileActionsMenu = ({ file }: { file: any }) => (
    <DropdownMenu>
      <DropdownMenuTrigger className="p-1.5 hover:bg-black/5 rounded-lg outline-none transition-colors">
        <MoreVertical className="w-5 h-5 text-black" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-canvas border-2 border-black rounded-xl shadow-[4px_4px_0px_#000000] p-1 font-sans">
        {file.mime_type !== 'application/vnd.google-apps.folder' && (
          <>
            <DropdownMenuItem 
              onClick={() => setPreviewFile(file)}
              className="cursor-pointer hover:bg-black/5 text-black font-heading font-bold focus:bg-black/5 outline-none rounded-lg p-2"
            >
              <Eye className="w-4 h-4 mr-2" /> Preview
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => {
                router.push(`/dashboard/download/${file.id}`);
              }}
              className="cursor-pointer hover:bg-black/5 text-black font-heading font-bold focus:bg-black/5 outline-none rounded-lg p-2"
            >
              <FileDown className="w-4 h-4 mr-2" /> Download
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleCopyLink(file.id)}
              className="cursor-pointer hover:bg-black/5 text-black font-heading font-bold focus:bg-black/5 outline-none rounded-lg p-2"
            >
              <Copy className="w-4 h-4 mr-2" /> Copy Link
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-black/20" />
          </>
        )}
        <DropdownMenuItem 
          onClick={() => {
            setNewName(file.original_file_name);
            setRenamingId(file.id);
          }}
          className="cursor-pointer hover:bg-black/5 text-black font-heading font-bold focus:bg-black/5 outline-none rounded-lg p-2"
        >
          <Pencil className="w-4 h-4 mr-2" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleDelete(file.id)}
          className="cursor-pointer hover:bg-brand-pink/10 text-brand-pink font-heading font-bold focus:bg-brand-pink/10 outline-none rounded-lg p-2"
        >
          <Trash2 className="w-4 h-4 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4 relative">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 font-sans">
        {/* Creation Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateFolderOpen(true)}
            className="bg-brand-mint hover:bg-emerald-400 text-black border-2 border-black px-4 py-2.5 rounded-xl font-heading font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_#000000] active:translate-y-[1.5px] active:shadow-none cursor-pointer flex items-center gap-2 transition-all"
          >
            <FolderPlus className="w-4.5 h-4.5" /> New Folder
          </button>
          <button
            onClick={() => setIsCreateTextOpen(true)}
            className="bg-brand-lavender hover:bg-indigo-300 text-black border-2 border-black px-4 py-2.5 rounded-xl font-heading font-black text-xs shadow-[2px_2px_0px_#000000] hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_#000000] active:translate-y-[1.5px] active:shadow-none cursor-pointer flex items-center gap-2 transition-all"
          >
            <FilePlus className="w-4.5 h-4.5" /> New Text File
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-canvas border-2 border-black rounded-xl p-1 shadow-[2px_2px_0px_#000000]">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-black text-white' : 'hover:bg-black/5 text-black'}`}
              title="List View"
            >
              <ListIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-black text-white' : 'hover:bg-black/5 text-black'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <select 
            value={`${sortField}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortField(field as any);
              setSortOrder(order as 'asc' | 'desc');
            }}
            className="bg-canvas border-2 border-black rounded-xl px-4 py-2 text-xs font-heading font-black text-black shadow-[2px_2px_0px_#000000] focus:outline-none cursor-pointer appearance-none pr-8 relative"
            style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="black" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            <option value="created_at-desc">Newest First</option>
            <option value="created_at-asc">Oldest First</option>
            <option value="size-desc">Size (Largest)</option>
            <option value="size-asc">Size (Smallest)</option>
            <option value="original_file_name-asc">Name (A-Z)</option>
            <option value="original_file_name-desc">Name (Z-A)</option>
          </select>
        </div>
      </div>

      {/* Breadcrumbs Navigation */}
      <div className="bg-canvas border-2 border-black rounded-xl p-3.5 shadow-[3px_3px_0px_#000000] flex items-center gap-2 flex-wrap text-sm font-heading font-bold text-black">
        <button
          onClick={() => router.push('/dashboard/files')}
          className="hover:text-brand-pink transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none"
        >
          <HardDrive className="w-4 h-4 text-black" /> Root
        </button>
        
        {breadcrumbs && breadcrumbs.map((bc, idx) => (
          <div key={bc.id} className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-[#5a5a5a]" />
            <button
              onClick={() => router.push(`/dashboard/files?folder=${bc.id}`)}
              className={`hover:text-brand-pink transition-colors cursor-pointer truncate max-w-[150px] focus:outline-none ${idx === breadcrumbs.length - 1 ? 'font-black text-black' : ''}`}
              title={bc.name}
            >
              {bc.name}
            </button>
          </div>
        ))}
      </div>

      {viewMode === 'list' ? (
        <div className="bg-surface-card border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-soft border-b-2 border-black text-xs font-heading font-black text-black uppercase tracking-wider">
                  <th className="py-4.5 px-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      checked={files.length > 0 && selectedIds.size === files.length}
                      onChange={toggleAll}
                      className="w-4 h-4 cursor-pointer accent-brand-mint border-black"
                    />
                  </th>
                  <th className="py-4.5 px-6">Item Details</th>
                  <th className="py-4.5 px-6">Size</th>
                  <th className="py-4.5 px-6">Distributed Shards</th>
                  <th className="py-4.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black/5 bg-canvas/30">
                {sortedFiles.length > 0 ? (
                  sortedFiles.map((file) => {
                    const parts = file.file_parts || [];
                    const isSplit = parts.length > 1;
                    const isSelected = selectedIds.has(file.id);
                    const isBeingRenamed = renamingId === file.id;
                    const fileIconInfo = getFileIconInfo(file.mime_type, file.original_file_name);
                    const Icon = fileIconInfo.icon;
                    const isFolder = file.mime_type === 'application/vnd.google-apps.folder';

                    return (
                      <tr 
                        key={file.id} 
                        draggable={!isBeingRenamed}
                        onDragStart={(e) => handleDragStart(e, file.id)}
                        onDragOver={isFolder ? (e) => handleDragOver(e, file.id) : undefined}
                        onDragLeave={isFolder ? (e) => handleDragLeave(e, file.id) : undefined}
                        onDrop={isFolder ? (e) => handleDrop(e, file.id) : undefined}
                        onDoubleClick={() => {
                          if (isFolder) {
                            router.push(`/dashboard/files?folder=${file.id}`);
                          } else {
                            setPreviewFile(file);
                          }
                        }}
                        className={`transition-all duration-150 group ${
                          isSelected 
                            ? 'bg-brand-mint/10' 
                            : dragOverFolderId === file.id
                              ? 'bg-brand-ochre/20 border-y-2 border-dashed border-black'
                              : 'hover:bg-canvas/65'
                        }`}
                      >
                        <td className="py-4.5 px-4 text-center">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleSelection(file.id)}
                            className="w-4 h-4 cursor-pointer accent-brand-mint border-black"
                          />
                        </td>
                        
                        {/* Name Details */}
                        <td className="py-4.5 px-6 max-w-[280px]">
                          <div className="flex items-center gap-3.5">
                            <div 
                              className="w-10 h-10 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000000] flex items-center justify-center flex-shrink-0 overflow-hidden bg-cover bg-center bg-no-repeat bg-white"
                              style={{ 
                                backgroundImage: file.thumbnail_url ? `url(${file.thumbnail_url})` : 'none',
                                backgroundColor: file.thumbnail_url ? '#ffffff' : fileIconInfo.bgColor 
                              }}
                            >
                              {!file.thumbnail_url && <Icon className="w-5 h-5 stroke-[2]" style={{ color: fileIconInfo.textColor }} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              {isBeingRenamed ? (
                                <div className="flex items-center gap-2">
                                  <input 
                                    autoFocus
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(file.id)}
                                    className="w-full bg-white border-2 border-black rounded-lg px-2 py-1 text-sm font-heading font-black text-black outline-none shadow-[2px_2px_0px_#000000]"
                                    disabled={isRenaming}
                                  />
                                  <button onClick={() => handleRenameSubmit(file.id)} disabled={isRenaming} className="p-1.5 bg-brand-mint border-2 border-black rounded-lg shadow-[1px_1px_0px_#000000] hover:translate-y-[0.5px]">
                                    {isRenaming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  </button>
                                  <button onClick={() => setRenamingId(null)} disabled={isRenaming} className="p-1.5 bg-brand-pink text-white border-2 border-black rounded-lg shadow-[1px_1px_0px_#000000] hover:translate-y-[0.5px]">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group/title">
                                  {isFolder ? (
                                    <button 
                                      onClick={() => router.push(`/dashboard/files?folder=${file.id}`)}
                                      className="text-sm font-heading font-black text-black hover:text-brand-pink text-left truncate hover:underline focus:outline-none"
                                      title={file.original_file_name}
                                    >
                                      {file.original_file_name}
                                    </button>
                                  ) : (
                                    <span 
                                      className="block text-sm font-heading font-black text-black truncate cursor-pointer hover:text-brand-pink transition-colors" 
                                      onClick={() => setPreviewFile(file)}
                                      title={file.original_file_name}
                                    >
                                      {file.original_file_name}
                                    </span>
                                  )}
                                </div>
                              )}
                              <span className="block text-[10px] text-[#5a5a5a] font-mono mt-0.5">
                                Created: {new Date(file.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Size */}
                        <td className="py-4.5 px-6">
                          <span className="text-xs font-black text-black font-mono">
                            {isFolder ? '—' : formatBytes(file.size)}
                          </span>
                        </td>

                        {/* Shard distribution */}
                        <td className="py-4.5 px-6">
                          {isFolder ? (
                            <span className="text-[10px] text-zinc-400 font-heading font-bold uppercase">
                              Virtual Folder
                            </span>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap gap-1.5">
                                {parts.map((part: any) => (
                                  <span 
                                    key={part.id} 
                                    className="inline-flex items-center gap-1 bg-brand-lavender text-black text-[9px] font-extrabold uppercase tracking-wider border-2 border-black px-2 py-0.5 rounded-full shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.15)]"
                                    title={part.accounts?.email}
                                  >
                                    <HardDrive className="w-2.5 h-2.5" /> P{part.part_number + 1}
                                  </span>
                                ))}
                              </div>
                              <span className="block text-[10px] text-[#5a5a5a] font-heading font-bold uppercase">
                                {isSplit ? `Split into ${parts.length} parts` : 'Single account file'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4.5 px-6 text-right">
                          <div className="inline-flex items-center justify-end gap-2.5 w-full">
                            <FileActionsMenu file={file} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted font-heading font-bold text-sm bg-canvas/10">
                      This folder is empty.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {sortedFiles.map((file) => {
            const fileIconInfo = getFileIconInfo(file.mime_type, file.original_file_name);
            const Icon = fileIconInfo.icon;
            const isSelected = selectedIds.has(file.id);
            const isBeingRenamed = renamingId === file.id;
            const isFolder = file.mime_type === 'application/vnd.google-apps.folder';

            return (
              <div 
                key={file.id}
                draggable={!isBeingRenamed}
                onDragStart={(e) => handleDragStart(e, file.id)}
                onDragOver={isFolder ? (e) => handleDragOver(e, file.id) : undefined}
                onDragLeave={isFolder ? (e) => handleDragLeave(e, file.id) : undefined}
                onDrop={isFolder ? (e) => handleDrop(e, file.id) : undefined}
                className={`relative group bg-surface-card border-2 border-black rounded-2xl p-4 flex flex-col items-center gap-3 transition-all cursor-pointer ${
                  isSelected 
                    ? 'shadow-[4px_4px_0px_#000000] ring-2 ring-black bg-brand-mint/20 translate-y-[-2px]' 
                    : dragOverFolderId === file.id
                      ? 'shadow-[6px_6px_0px_#d97706] ring-2 ring-black bg-brand-ochre/20 translate-y-[-2px]'
                      : 'shadow-[4px_4px_0px_#000000] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_#000000]'
                }`}
                onClick={(e) => {
                  // Prevent selection if clicking inside actions menu or renaming input
                  if ((e.target as HTMLElement).closest('.file-actions') || isBeingRenamed) return;
                  if (isFolder) {
                    router.push(`/dashboard/files?folder=${file.id}`);
                  } else {
                    toggleSelection(file.id);
                  }
                }}
                onDoubleClick={() => {
                  if (isFolder) {
                    router.push(`/dashboard/files?folder=${file.id}`);
                  } else {
                    setPreviewFile(file);
                  }
                }}
              >
                {/* Selection Checkbox (Absolute) */}
                <div className="absolute top-3 left-3 file-actions">
                  <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={() => toggleSelection(file.id)}
                    className="w-4 h-4 cursor-pointer accent-brand-mint border-black opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity"
                  />
                </div>

                {/* Actions Menu (Absolute) */}
                <div className="absolute top-2 right-2 file-actions">
                  <FileActionsMenu file={file} />
                </div>

                {/* Large Icon / Thumbnail */}
                <div 
                  className="w-16 h-16 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000000] mt-2 transition-transform group-hover:scale-105 flex items-center justify-center flex-shrink-0 overflow-hidden bg-cover bg-center bg-no-repeat bg-white"
                  style={{ 
                    backgroundImage: file.thumbnail_url ? `url(${file.thumbnail_url})` : 'none',
                    backgroundColor: file.thumbnail_url ? '#ffffff' : fileIconInfo.bgColor 
                  }}
                >
                  {!file.thumbnail_url && <Icon className="w-10 h-10 stroke-[1.5]" style={{ color: fileIconInfo.textColor }} />}
                </div>

                {/* File Details */}
                <div className="w-full text-center space-y-1 min-w-0">
                  {isBeingRenamed ? (
                    <div className="flex flex-col items-center gap-2 w-full file-actions">
                      <input 
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(file.id)}
                        className="w-full bg-white border-2 border-black rounded-lg px-2 py-1 text-xs font-heading font-black text-black outline-none shadow-[2px_2px_0px_#000000]"
                        disabled={isRenaming}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleRenameSubmit(file.id)} disabled={isRenaming} className="p-1 bg-brand-mint border-2 border-black rounded-lg shadow-[1px_1px_0px_#000000]">
                          {isRenaming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </button>
                        <button onClick={() => setRenamingId(null)} disabled={isRenaming} className="p-1 bg-brand-pink text-white border-2 border-black rounded-lg shadow-[1px_1px_0px_#000000]">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-heading font-black text-black truncate w-full px-2" title={file.original_file_name}>
                      {file.original_file_name}
                    </p>
                  )}
                  <p className="text-[10px] text-[#5a5a5a] font-mono">
                    {isFolder ? 'Folder' : formatBytes(file.size)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PreviewDialog 
        file={previewFile} 
        open={!!previewFile} 
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }} 
      />

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="bg-black text-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] px-6 py-4 flex items-center gap-6">
            <span className="font-heading font-black text-sm">
              <span className="bg-white text-black px-2 py-0.5 rounded-md mr-2">{selectedIds.size}</span>
              Items Selected
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs font-heading font-bold hover:underline opacity-80 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className={`
                  border-2 border-white rounded-xl text-xs flex items-center gap-1.5 
                  px-4 py-2 transition-all font-heading font-black
                  ${isBulkDeleting 
                    ? 'opacity-70 cursor-wait bg-zinc-700 text-white shadow-none translate-y-[1.5px]' 
                    : 'cursor-pointer hover:translate-y-[0.5px] active:translate-y-[1.5px] active:shadow-none'}
                  ${bulkConfirming && !isBulkDeleting
                    ? 'bg-rose-500 text-white shadow-[2px_2px_0px_rgba(255,255,255,0.3)] animate-pulse hover:bg-rose-600' 
                    : !isBulkDeleting 
                      ? 'bg-brand-pink text-white hover:bg-rose-600 shadow-[2px_2px_0px_rgba(255,255,255,0.3)] hover:shadow-[1.5px_1.5px_0px_rgba(255,255,255,0.3)]' 
                      : ''
                  }
                `}
              >
                {isBulkDeleting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</>
                ) : bulkConfirming ? (
                  <><Trash2 className="w-4 h-4 animate-bounce" /> Sure?</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Delete Selected</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Dialogs Block --- */}

      {/* Create Folder Dialog */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent className="sm:max-w-md bg-canvas border-4 border-black rounded-2xl shadow-[8px_8px_0px_#000000] p-6 font-sans">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-heading font-black text-black">Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-xs font-heading font-bold text-[#5a5a5a]">
              The folder will be created virtually inside the current directory.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-heading font-black uppercase tracking-wider text-black">Folder Name</label>
              <Input
                placeholder="Enter folder name..."
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                className="bg-white border-2 border-black text-black px-4 py-6 rounded-xl font-heading font-bold shadow-[3px_3px_0px_#000000] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-black"
                disabled={isCreatingFolder}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <button
              onClick={() => setIsCreateFolderOpen(false)}
              className="bg-white hover:bg-zinc-100 text-black border-2 border-black px-4 py-2.5 rounded-xl font-heading font-black text-xs shadow-[2px_2px_0px_#000000] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer"
              disabled={isCreatingFolder}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateFolder}
              className="bg-brand-mint hover:bg-emerald-400 text-black border-2 border-black px-4 py-2.5 rounded-xl font-heading font-black text-xs shadow-[2px_2px_0px_#000000] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5"
              disabled={isCreatingFolder}
            >
              {isCreatingFolder ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              ) : (
                'Create Folder'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Text File Dialog */}
      <Dialog open={isCreateTextOpen} onOpenChange={setIsCreateTextOpen}>
        <DialogContent className="sm:max-w-lg bg-canvas border-4 border-black rounded-2xl shadow-[8px_8px_0px_#000000] p-6 font-sans">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-heading font-black text-black">Create Text Document</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-heading font-black uppercase tracking-wider text-black">File Name</label>
              <Input
                placeholder="e.g. notes.txt"
                value={textFileName}
                onChange={(e) => setTextFileName(e.target.value)}
                className="bg-white border-2 border-black text-black px-4 py-6 rounded-xl font-heading font-bold shadow-[3px_3px_0px_#000000] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-black"
                disabled={isCreatingText}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-heading font-black uppercase tracking-wider text-black">Content</label>
              <textarea
                placeholder="Type your file contents here..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="w-full bg-white border-2 border-black text-black p-4 rounded-xl font-sans text-sm shadow-[3px_3px_0px_#000000] min-h-[220px] resize-none focus:outline-none focus:ring-0 focus:border-black"
                disabled={isCreatingText}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <button
              onClick={() => setIsCreateTextOpen(false)}
              className="bg-white hover:bg-zinc-100 text-black border-2 border-black px-4 py-2.5 rounded-xl font-heading font-black text-xs shadow-[2px_2px_0px_#000000] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer"
              disabled={isCreatingText}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTextFile}
              className="bg-brand-lavender hover:bg-indigo-300 text-black border-2 border-black px-4 py-2.5 rounded-xl font-heading font-black text-xs shadow-[2px_2px_0px_#000000] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5"
              disabled={isCreatingText}
            >
              {isCreatingText ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                'Save to Google Drive'
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
