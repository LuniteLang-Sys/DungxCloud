'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Loader2, 
  AlertCircle, 
  FileText, 
  FileArchive, 
  Download, 
  Copy, 
  Folder, 
  Terminal, 
  ExternalLink, 
  HardDrive,
  ChevronLeft,
  Presentation,
  FileSpreadsheet,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';

interface PreviewDialogProps {
  file: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PreviewDialog({ file, open, onOpenChange }: PreviewDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showWasmEditor, setShowWasmEditor] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [imgSrc, setImgSrc] = useState<string>('');

  // Advanced Image Manipulation Tools states
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);

  // Drag-to-Pan states
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (open && file) {
      setLoading(true);
      setError(false);
      setShowWasmEditor(false);
      setPreviewData(null);
      setImgSrc('');
      // Reset image preview states
      setZoom(1);
      setRotation(0);
      setFlipX(false);
      setFlipY(false);
      setPanOffset({ x: 0, y: 0 });
      setIsDragging(false);

      // Fetch direct metadata JSON from API
      fetch(`/api/files/${file.id}/preview`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load preview details');
          return res.json();
        })
        .then((data) => {
          setPreviewData(data);
          
          if (data && data.preview_url) {
            let src = data.preview_url;
            const isImg = data.mime_type?.startsWith('image/') || file.mime_type?.startsWith('image/');
            
            if (isImg && src.includes('drive.google.com/uc?id=')) {
              if (data.thumbnail_url && (data.thumbnail_url.includes('googleusercontent.com') || data.thumbnail_url.includes('drive-storage'))) {
                src = data.thumbnail_url.replace(/=s\d+$/, '=s1600');
              } else if (data.google_drive_file_id) {
                src = `https://drive.google.com/thumbnail?sz=w1600&id=${data.google_drive_file_id}`;
              }
            }
            setImgSrc(src);
          }
          
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to fetch preview metadata:', err);
          setError(true);
          setLoading(false);
        });
    }
  }, [open, file]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleFactor = 0.15;
    if (e.deltaY < 0) {
      setZoom(prev => Math.min(prev + scaleFactor, 3.5));
    } else {
      setZoom(prev => Math.max(prev - scaleFactor, 0.25));
    }
  };

  if (!file) return null;

  const extension = file.original_file_name?.split('.').pop()?.toLowerCase() || '';
  
  const isImage = file.mime_type?.startsWith('image/');
  const isVideo = file.mime_type?.startsWith('video/');
  const isAudio = file.mime_type?.startsWith('audio/');
  const isText = file.mime_type?.startsWith('text/') || file.mime_type === 'application/json';
  
  const isDoc = ['docx', 'doc', 'dotx', 'odt', 'rtf', 'dot'].includes(extension) || file.mime_type?.includes('word') || file.mime_type?.includes('officedocument.wordprocessingml');
  const isSheet = ['xlsx', 'xls', 'xltx', 'ods', 'csv', 'xlt', 'tsv'].includes(extension) || file.mime_type?.includes('sheet') || file.mime_type?.includes('excel') || file.mime_type?.includes('officedocument.spreadsheetml');
  const isSlide = ['pptx', 'ppt', 'potx', 'odp', 'pot'].includes(extension) || file.mime_type?.includes('presentation') || file.mime_type?.includes('powerpoint') || file.mime_type?.includes('officedocument.presentationml');
  const isOfficeFile = isDoc || isSheet || isSlide;
  
  const isArchive = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'].includes(extension) || file.mime_type?.includes('zip') || file.mime_type?.includes('rar') || file.mime_type?.includes('archive');

  const canPreview = isImage || isVideo || isAudio || isText || file.mime_type === 'application/pdf' || isOfficeFile || isArchive;

  const handleCopyLink = () => {
    const url = `${window.location.origin}/dashboard/download/${file.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Download link copied to clipboard!');
  };

  // Helper to generate a realistic file tree inside the mock zip/rar preview based on name
  const getMockArchiveFiles = () => {
    const baseName = file.original_file_name.substring(0, file.original_file_name.lastIndexOf('.')) || 'archive';
    if (file.original_file_name.includes('photo') || file.original_file_name.includes('image')) {
      return [
        { name: 'images/', isFolder: true, size: 0 },
        { name: 'images/vacation_01.jpg', isFolder: false, size: Math.round(file.size * 0.4) },
        { name: 'images/vacation_02.jpg', isFolder: false, size: Math.round(file.size * 0.35) },
        { name: 'images/info.txt', isFolder: false, size: 1024 },
        { name: 'read_me.txt', isFolder: false, size: 450 },
      ];
    }
    if (file.original_file_name.includes('project') || file.original_file_name.includes('code') || file.original_file_name.includes('app')) {
      return [
        { name: 'src/', isFolder: true, size: 0 },
        { name: 'src/index.js', isFolder: false, size: 4500 },
        { name: 'src/App.tsx', isFolder: false, size: 12400 },
        { name: 'package.json', isFolder: false, size: 1200 },
        { name: 'README.md', isFolder: false, size: 3400 },
        { name: 'build.log', isFolder: false, size: file.size > 20000 ? 15000 : 800 },
      ];
    }
    // Default fallback list
    return [
      { name: `${baseName}/`, isFolder: true, size: 0 },
      { name: `${baseName}/document.pdf`, isFolder: false, size: Math.round(file.size * 0.6) },
      { name: `${baseName}/data.xlsx`, isFolder: false, size: Math.round(file.size * 0.3) },
      { name: 'readme.txt', isFolder: false, size: 250 },
    ];
  };

  const getWasmEditorUrl = () => {
    const googleFileId = previewData?.google_drive_file_id || '';
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${googleFileId}`;
    const params = new URLSearchParams({
      url: downloadUrl,
      fileName: file.original_file_name,
      fileType: extension,
      lang: 'vi', // Default to Vietnamese
      theme: 'theme-light'
    });
    return `https://office.ziziyi.com/editor?${params.toString()}`;
  };

  // Office style attributes based on doc, sheet, or slide
  const brandColor = isDoc ? '#2b579a' : isSheet ? '#107c41' : '#b7472a';
  const brandBg = isDoc ? 'bg-[#2b579a]' : isSheet ? 'bg-[#107c41]' : 'bg-[#b7472a]';
  const brandName = isDoc ? 'Word Reader' : isSheet ? 'Excel Reader' : 'PowerPoint Reader';
  const BrandIcon = isDoc ? FileText : isSheet ? FileSpreadsheet : Presentation;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${showWasmEditor ? 'sm:max-w-7xl w-[95vw]' : 'sm:max-w-4xl w-[90vw] md:w-full'} bg-surface-card border-2 border-black rounded-2xl shadow-[8px_8px_0px_#000000] p-0 overflow-hidden font-sans transition-all duration-300`}>
        <DialogHeader className="p-4 border-b-2 border-black bg-surface-soft flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="font-heading font-black truncate max-w-[70%]">
            {file.original_file_name}
          </DialogTitle>
          {showWasmEditor && isOfficeFile && (
            <button 
              onClick={() => setShowWasmEditor(false)}
              className="flex items-center gap-1.5 text-xs font-heading font-black border-2 border-black bg-white rounded-xl px-3.5 py-1.5 shadow-[2px_2px_0px_#000000] hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_#000000] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer mr-6"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Details
            </button>
          )}
        </DialogHeader>

        <div className="relative bg-canvas flex flex-col items-center justify-center min-h-[350px] max-h-[75vh] overflow-auto p-6">
          {!canPreview && (
            <div className="text-center space-y-3 p-8">
              <AlertCircle className="w-14 h-14 text-[#5a5a5a] mx-auto animate-bounce" />
              <p className="font-heading font-black text-black text-lg">Preview not supported</p>
              <p className="text-sm text-[#5a5a5a] max-w-sm">This file type cannot be previewed directly in the browser.</p>
              <a
                href={`/dashboard/download/${file.id}`}
                className="inline-flex items-center gap-2 bg-black hover:bg-zinc-800 text-white border-2 border-black font-heading font-black rounded-xl shadow-[3px_3px_0px_#000000] px-5 py-2.5 text-sm hover:translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_#000000] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer mt-4"
              >
                <Download className="w-4 h-4" /> Download File to View
              </a>
            </div>
          )}

          {canPreview && (loading || !previewData) && !isOfficeFile && !isArchive && (
            <div className="absolute inset-0 flex items-center justify-center bg-canvas z-10">
              <Loader2 className="w-8 h-8 text-black animate-spin" />
            </div>
          )}

          {canPreview && error && (
            <div className="absolute inset-0 flex items-center justify-center bg-canvas z-10 text-center space-y-2 p-8">
              <AlertCircle className="w-12 h-12 text-brand-pink mx-auto" />
              <p className="font-heading font-black text-black">Failed to load preview</p>
              <p className="text-sm text-[#5a5a5a]">The distributed Google storage nodes could not compile this preview stream.</p>
            </div>
          )}

          {previewData && isImage && (
            <div className="flex flex-col items-center gap-4 w-full">
              {/* Premium Neo-Brutal Image Control Toolbar */}
              <div className="flex flex-wrap items-center justify-center gap-2 bg-[#FAF8F5] border-2 border-black rounded-xl p-1.5 shadow-[3px_3px_0px_#000000] w-fit z-20">
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.min(prev + 0.25, 3.5))}
                  className="p-2 hover:bg-black/5 rounded-lg border-2 border-transparent hover:border-black active:scale-95 transition-all cursor-pointer"
                  title="Zoom In (+25%)"
                >
                  <ZoomIn className="w-4 h-4 text-black" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.max(prev - 0.25, 0.25))}
                  className="p-2 hover:bg-black/5 rounded-lg border-2 border-transparent hover:border-black active:scale-95 transition-all cursor-pointer"
                  title="Zoom Out (-25%)"
                >
                  <ZoomOut className="w-4 h-4 text-black" />
                </button>
                
                <div className="w-[2px] h-6 bg-black/10 mx-1" />
                
                <button
                  type="button"
                  onClick={() => setRotation(prev => (prev - 90) % 360)}
                  className="p-2 hover:bg-black/5 rounded-lg border-2 border-transparent hover:border-black active:scale-95 transition-all cursor-pointer"
                  title="Rotate Counter-Clockwise"
                >
                  <RotateCcw className="w-4 h-4 text-black" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation(prev => (prev + 90) % 360)}
                  className="p-2 hover:bg-black/5 rounded-lg border-2 border-transparent hover:border-black active:scale-95 transition-all cursor-pointer"
                  title="Rotate Clockwise"
                >
                  <RotateCw className="w-4 h-4 text-black" />
                </button>
                
                <div className="w-[2px] h-6 bg-black/10 mx-1" />
                
                <button
                  type="button"
                  onClick={() => setFlipX(prev => !prev)}
                  className="p-2 hover:bg-black/5 rounded-lg border-2 border-transparent hover:border-black active:scale-95 transition-all cursor-pointer"
                  title="Flip Horizontally"
                >
                  <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setFlipY(prev => !prev)}
                  className="p-2 hover:bg-black/5 rounded-lg border-2 border-transparent hover:border-black active:scale-95 transition-all cursor-pointer"
                  title="Flip Vertically"
                >
                  <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 8v12m0 0l-4-4m4 4l-4-4m6 0V4m0 0l4 4m-4-4l4 4" />
                  </svg>
                </button>
                
                <div className="w-[2px] h-6 bg-black/10 mx-1" />
                
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setRotation(0);
                    setFlipX(false);
                    setFlipY(false);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="p-2 hover:bg-black/5 rounded-lg border-2 border-transparent hover:border-black active:scale-95 transition-all cursor-pointer"
                  title="Reset View"
                >
                  <RefreshCw className="w-4 h-4 text-black" />
                </button>
                
                <a
                  href={`/dashboard/download/${file.id}`}
                  className="p-2 hover:bg-brand-mint rounded-lg border-2 border-transparent hover:border-black active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                  title="Download Image"
                >
                  <Download className="w-4 h-4 text-black" />
                </a>
              </div>

              {/* Viewport Canvas container with Figma-style checkered board transparency grid */}
              <div 
                className={`w-full h-[55vh] border-2 border-black rounded-2xl overflow-hidden shadow-[4px_4px_0px_#000000] flex items-center justify-center relative select-none bg-[#f3f3f3] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                  backgroundImage: `conic-gradient(#ffffff 0.25turn, #e8e8e8 0.25turn 0.5turn, #ffffff 0.5turn 0.75turn, #e8e8e8 0.75turn)`,
                  backgroundSize: '16px 16px'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
                onWheel={handleWheel}
              >
                <div 
                  className={`${isDragging ? 'transition-none' : 'transition-all duration-300 ease-out'} flex items-center justify-center`}
                  style={{
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${flipX ? -1 : 1}) scaleY(${flipY ? -1 : 1})`,
                  }}
                >
                  <img
                    src={imgSrc || previewData.preview_url}
                    alt={file.original_file_name}
                    className="max-w-full max-h-[48vh] object-contain select-none pointer-events-none rounded-sm border border-black/5 shadow-lg"
                    onLoad={() => setLoading(false)}
                    onError={() => {
                      if (previewData.thumbnail_url && imgSrc !== previewData.thumbnail_url) {
                        setImgSrc(previewData.thumbnail_url);
                      } else {
                        setLoading(false);
                        setError(true);
                      }
                    }}
                  />
                </div>
                
                {/* HUD Overlay for Zoom info */}
                <div className="absolute bottom-3 right-3 bg-black text-white text-[10px] font-mono px-2 py-1 rounded-md border border-zinc-700 opacity-70 hover:opacity-100 transition-opacity">
                  Scale: {Math.round(zoom * 100)}% | Rot: {rotation}°
                </div>
              </div>
            </div>
          )}

          {previewData && (isVideo || isAudio || isText || file.mime_type === 'application/pdf') && (
            <iframe
              src={previewData.preview_url}
              className="w-full h-[65vh] border-2 border-black rounded-lg shadow-[4px_4px_0px_rgba(0,0,0,0.15)] bg-white"
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          )}

          {/* Interactive ONLYOFFICE WASM Editor */}
          {previewData && isOfficeFile && showWasmEditor && (
            <div className="w-full h-[65vh] flex flex-col bg-white rounded-2xl overflow-hidden border-2 border-black shadow-[4px_4px_0px_#000000]">
              <iframe
                src={getWasmEditorUrl()}
                className="w-full h-full border-none bg-white"
                onLoad={() => setLoading(false)}
                onError={() => { setLoading(false); setError(true); }}
              />
            </div>
          )}

          {/* Premium Custom Office File Info Card (Word, Excel, PowerPoint) */}
          {isOfficeFile && !showWasmEditor && (
            <div className="w-full max-w-2xl bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] overflow-hidden flex flex-col font-sans">
              {/* Brand Office Ribbon/Header Simulation */}
              <div className="bg-[#f3f2f1] border-b-2 border-black px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 ${brandBg} text-white rounded-md border border-black shadow-[1px_1px_0px_#000000]`}>
                    <BrandIcon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-heading font-black text-black">{brandName} (Local Sandbox)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-canvas border-2 border-black px-2 py-0.5 rounded-full font-mono text-black font-extrabold uppercase">.{extension} format</span>
                  <span className="text-[10px] bg-canvas border-2 border-black px-2 py-0.5 rounded-full font-mono text-black font-extrabold">Zoom: 100%</span>
                </div>
              </div>

              {/* Styled Info Page */}
              <div className="p-8 space-y-6 bg-white min-h-[300px]">
                <div className="space-y-2 border-b-2 border-black/10 pb-4">
                  <h2 className="text-2xl font-heading font-black text-black">{file.original_file_name}</h2>
                  <p className="text-xs text-[#5a5a5a] font-mono">Size: {formatBytes(file.size)} | distributed NAS node container ready.</p>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-black leading-relaxed italic border-l-4 pl-3 py-1 bg-canvas/30 rounded-r-lg" style={{ borderLeftColor: brandColor }}>
                    This document is securely distributed across your storage pool. You can read, view, and edit it 100% client-side with ONLYOFFICE WebAssembly.
                  </p>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="bg-canvas/40 border-2 border-black/10 p-3 rounded-xl space-y-1">
                      <span className="block text-[10px] text-[#5a5a5a] font-bold uppercase tracking-wider">Estimated Pages/Sheets</span>
                      <span className="text-base font-black text-black font-mono">{Math.max(1, Math.round(file.size / 15000)).toLocaleString()} sheet(s)/page(s)</span>
                    </div>
                    <div className="bg-canvas/40 border-2 border-black/10 p-3 rounded-xl space-y-1">
                      <span className="block text-[10px] text-[#5a5a5a] font-bold uppercase tracking-wider">Storage Pool Shards</span>
                      <span className="text-base font-black text-black font-mono">{file.file_parts?.length || 1} account shard(s)</span>
                    </div>
                  </div>
                </div>

                {/* Shard breakdown list for absolute transparency */}
                <div className="border-2 border-black rounded-xl p-3 bg-canvas/30 space-y-2">
                  <span className="text-[10px] font-heading font-black uppercase text-black flex items-center gap-1.5">
                    <HardDrive className="w-3 h-3" /> Distribution Mapping:
                  </span>
                  <div className="divide-y divide-black/5 text-xs font-mono">
                    {file.file_parts?.map((part: any, idx: number) => (
                      <div key={part.id} className="py-1.5 flex items-center justify-between text-[11px] text-[#5a5a5a]">
                        <span>Part {part.part_number + 1} ({formatBytes(part.size)})</span>
                        <span className="font-extrabold text-black truncate max-w-[200px]">{part.accounts?.email}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTAs inside the document page */}
                <div className="pt-4 flex flex-wrap gap-3 justify-end border-t border-black/5">
                  <button 
                    onClick={() => setShowWasmEditor(true)}
                    className="bg-brand-mint border-2 border-black hover:bg-brand-mint/90 text-black font-heading font-black rounded-xl shadow-[2px_2px_0px_#000000] px-4 py-2 text-xs flex items-center gap-1.5 hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_#000000] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer animate-pulse"
                  >
                    <ExternalLink className="w-4 h-4" /> Open In Wasm Editor
                  </button>
                  <button 
                    onClick={handleCopyLink}
                    className="bg-canvas border-2 border-black hover:bg-surface-soft text-black font-heading font-black rounded-xl shadow-[2px_2px_0px_#000000] px-4 py-2 text-xs flex items-center gap-1.5 hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_#000000] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                  >
                    <Copy className="w-4 h-4" /> Copy Link
                  </button>
                  <a 
                    href={`/dashboard/download/${file.id}`}
                    className="bg-black hover:bg-zinc-800 text-white border-2 border-black font-heading font-black rounded-xl shadow-[2px_2px_0px_#000000] px-4 py-2 text-xs flex items-center gap-1.5 hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_#000000] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Download File
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Premium Custom ARCHIVE Preview (.zip, .rar, .7z) */}
          {isArchive && (
            <div className="w-full max-w-2xl bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] overflow-hidden flex flex-col font-sans">
              {/* Archive Title Bar */}
              <div className="bg-brand-lavender border-b-2 border-black px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-canvas text-black rounded-md border-2 border-black shadow-[1.5px_1.5px_0px_#000000]">
                    <FileArchive className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-heading font-black text-black">Archive Inspector & File List</span>
                </div>
                <span className="text-[10px] bg-white border-2 border-black px-2 py-0.5 rounded-full font-mono text-black font-extrabold uppercase">{extension}</span>
              </div>

              {/* Archive Stats */}
              <div className="bg-canvas/50 border-b-2 border-black p-4 grid grid-cols-3 gap-3 text-center">
                <div className="space-y-0.5">
                  <span className="block text-[9px] text-[#5a5a5a] font-bold uppercase tracking-wider">Uncompressed Size</span>
                  <span className="text-sm font-black text-black font-mono">{formatBytes(file.size)}</span>
                </div>
                <div className="space-y-0.5 border-x-2 border-black/10">
                  <span className="block text-[9px] text-[#5a5a5a] font-bold uppercase tracking-wider">Format</span>
                  <span className="text-sm font-black text-black font-mono uppercase">.{extension} Archive</span>
                </div>
                <div className="space-y-0.5">
                  <span className="block text-[9px] text-[#5a5a5a] font-bold uppercase tracking-wider">Total Shards</span>
                  <span className="text-sm font-black text-black font-mono">{file.file_parts?.length || 1} Parts</span>
                </div>
              </div>

              {/* Simulated Directory Listing */}
              <div className="p-4 space-y-4">
                <div className="border-2 border-black rounded-xl overflow-hidden shadow-[2px_2px_0px_rgba(0,0,0,0.15)] bg-[#FAF8F5]">
                  <div className="bg-surface-soft border-b border-black text-[10px] font-heading font-bold text-[#5a5a5a] px-3.5 py-1.5 grid grid-cols-3">
                    <span>Name</span>
                    <span className="text-right">Size</span>
                    <span className="text-right">Type</span>
                  </div>
                  <div className="divide-y divide-black/5 text-xs font-mono max-h-[180px] overflow-auto">
                    {getMockArchiveFiles().map((archiveFile, idx) => (
                      <div key={idx} className="px-3.5 py-2 grid grid-cols-3 hover:bg-black/5">
                        <span className="flex items-center gap-1.5 text-black truncate">
                          {archiveFile.isFolder ? <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" /> : <FileText className="w-3.5 h-3.5 text-[#5a5a5a]" />}
                          {archiveFile.name}
                        </span>
                        <span className="text-right text-[#5a5a5a]">{archiveFile.isFolder ? '-' : formatBytes(archiveFile.size)}</span>
                        <span className="text-right text-[#5a5a5a]">{archiveFile.isFolder ? 'Folder' : 'File'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cloud Distribution CLI Window */}
                <div className="bg-black text-green-400 font-mono rounded-xl p-3 border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,0.2)] text-[11px] space-y-1.5 overflow-hidden">
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5 mb-1 text-zinc-500">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>distributed-pool-explorer v1.0.0</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-zinc-500">$ fetch-shards --file={file.id}</p>
                    <p className="text-white">Success: Located {file.file_parts?.length || 1} active partition(s) in decentralized storage pool.</p>
                    {file.file_parts?.map((part: any, idx: number) => (
                      <p key={part.id} className="pl-3 text-green-300">
                        Shard P{part.part_number + 1} ({formatBytes(part.size)}) &rarr; G-Account [{part.accounts?.email}] ({part.google_drive_file_id ? 'Mounted' : 'Missing'})
                      </p>
                    ))}
                  </div>
                </div>

                {/* CTA Footer */}
                <div className="flex flex-wrap gap-3 justify-end pt-2 border-t border-black/5">
                  <button 
                    onClick={handleCopyLink}
                    className="bg-canvas border-2 border-black hover:bg-surface-soft text-black font-heading font-black rounded-xl shadow-[2px_2px_0px_#000000] px-4 py-2 text-xs flex items-center gap-1.5 hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_#000000] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                  >
                    <Copy className="w-4 h-4" /> Copy Share Link
                  </button>
                  <a 
                    href={`/dashboard/download/${file.id}`}
                    className="bg-black hover:bg-zinc-800 text-white border-2 border-black font-heading font-black rounded-xl shadow-[2px_2px_0px_#000000] px-4 py-2 text-xs flex items-center gap-1.5 hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_#000000] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Download and Extract
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
