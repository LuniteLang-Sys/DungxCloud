'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CloudUpload, File as FileIcon, XCircle, CheckCircle2, Loader2, ArrowUpRight, ShieldCheck, Activity } from 'lucide-react';
import { formatBytes, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

type UploadFile = {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  errorMessage?: string;
};

export default function DashboardPage() {
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const router = useRouter();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newUploads = acceptedFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'pending' as const
    }));
    setUploads(prev => [...newUploads, ...prev]);
    
    newUploads.forEach(u => processUpload(u));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const updateUploadStatus = (id: string, updates: Partial<UploadFile>) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  };

  const processUpload = async (uploadItem: UploadFile) => {
    updateUploadStatus(uploadItem.id, { status: 'uploading', progress: 0 });
    const file = uploadItem.file;

    // Helper to push high-frequency client-side metrics
    const pushTelemetry = async (type: string, labels: any = {}, amount = 1) => {
      try {
        await fetch('/api/metrics/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            events: [{ type, labels, amount }]
          })
        });
      } catch (e) {
        console.warn('Telemetry delivery failed', e);
      }
    };

    // Generate client-side standard W3C trace context
    const generateW3CTrace = () => {
      const hex = (size: number) => {
        const arr = new Uint8Array(size);
        window.crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
      };
      return {
        traceId: hex(16),
        spanId: hex(8),
      };
    };

    const trace = generateW3CTrace();
    const traceparent = `00-${trace.traceId}-${trace.spanId}-01`;

    try {
      await pushTelemetry('upload_attempt', { file_name: file.name, is_split: file.size > 15 * 1024 * 1024 });

      const initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'traceparent': traceparent,
        },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
        }),
      });

      if (!initRes.ok) {
        const errorData = await initRes.json();
        throw new Error(errorData.error || 'Init failed');
      }

      const { fileId, sessions, isSplit, chunkSize } = await initRes.json();
      
      let totalUploadedBytes = 0;

      // 1. Prepare chunks with their sessions
      const chunksToUpload = sessions.map((session: any, i: number) => {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        return { session, chunk };
      });

      // 2. Define individual upload task wrapper with Exponential Backoff retry
      const uploadWithRetry = async (session: any, chunk: Blob, maxAttempts = 3): Promise<any> => {
        let attempts = 0;
        while (attempts < maxAttempts) {
          try {
            const res = await new Promise<any>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('PUT', session.uploadUrl, true);
              xhr.setRequestHeader('Content-Range', `bytes 0-${session.size - 1}/${session.size}`);
              // Google Drive allows custom headers in resumes. We inject our trace parent for operational logging.
              xhr.setRequestHeader('traceparent', traceparent);
              
              let lastLoaded = 0;
              xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                  const delta = e.loaded - lastLoaded;
                  lastLoaded = e.loaded;
                  totalUploadedBytes += delta;
                  const percent = Math.round((totalUploadedBytes / file.size) * 100);
                  updateUploadStatus(uploadItem.id, { progress: Math.min(percent, 99) });
                }
              };

              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  try {
                    const response = JSON.parse(xhr.responseText);
                    resolve({
                      partNumber: session.partNumber,
                      accountId: session.accountId,
                      size: session.size,
                      googleDriveFileId: response.id,
                    });
                  } catch (err) {
                    reject(new Error('Failed to parse Google Drive response'));
                  }
                } else {
                  reject(new Error(`Upload failed with status ${xhr.status}`));
                }
              };

              xhr.onerror = () => reject(new Error('Network error during upload'));
              xhr.send(chunk);
            });

            if (attempts > 0) {
              await pushTelemetry('upload_recovery', { file_name: file.name, part_number: session.partNumber });
            }
            return res;
          } catch (err) {
            attempts++;
            await pushTelemetry('chunk_retry', { file_name: file.name, part_number: session.partNumber });
            if (attempts >= maxAttempts) throw err;
            const delay = Math.pow(2, attempts) * 1000; // Exponential backoff retry delay
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      };

      // 3. Pool throttling execution (max 2 concurrent uploads to avoid browser and bandwidth choking)
      const CONCURRENT_LIMIT = 2;
      const partsResult = new Array(sessions.length);
      const queue = chunksToUpload.map((item: any, index: number) => ({ ...item, index }));
      
      const workers = Array(Math.min(CONCURRENT_LIMIT, queue.length)).fill(null).map(async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          const result = await uploadWithRetry(item.session, item.chunk);
          partsResult[item.index] = result;
        }
      });

      await Promise.all(workers);

      const completeRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'traceparent': traceparent,
        },
        body: JSON.stringify({ fileId, parts: partsResult }),
      });

      if (!completeRes.ok) throw new Error('Failed to finalize upload');

      updateUploadStatus(uploadItem.id, { status: 'completed', progress: 100 });
      toast.success(`${file.name} uploaded successfully!`);
      
      // Invalidate Next.js client router cache so navigating to Files shows the new upload immediately
      router.refresh();

    } catch (error: any) {
      updateUploadStatus(uploadItem.id, { status: 'error', errorMessage: error.message });
      toast.error(`Failed to upload ${file.name}: ${error.message}`);
    }
  };

  const totalCompleted = uploads.filter(u => u.status === 'completed').length;
  const totalUploading = uploads.filter(u => u.status === 'uploading').length;
  const totalError = uploads.filter(u => u.status === 'error').length;

  return (
    <div className="space-y-8 max-w-5xl mx-auto font-sans antialiased">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-heading font-black tracking-tight text-black" style={{ letterSpacing: '-0.8px' }}>
          Upload Center
        </h1>
        <p className="text-[#5a5a5a] mt-1 text-sm font-heading font-bold">
          Drag and drop files to securely distribute them across your multi-account Google Drive storage pool.
        </p>
      </div>

      {/* Saturated Clay Style Mini Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="bg-brand-ochre border-2 border-black rounded-2xl shadow-[4px_4px_0px_#000000] transition-transform hover:translate-y-[-1px]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-canvas border-2 border-black text-black shadow-[2px_2px_0px_#000000]">
              <Activity className="w-5 h-5 text-black" />
            </div>
            <div>
              <p className="text-[10px] font-heading font-black text-black/60 uppercase tracking-widest">Active Uploads</p>
              <p className="text-2xl font-heading font-black text-black mt-0.5">{totalUploading}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-brand-mint border-2 border-black rounded-2xl shadow-[4px_4px_0px_#000000] transition-transform hover:translate-y-[-1px]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-canvas border-2 border-black text-black shadow-[2px_2px_0px_#000000]">
              <ShieldCheck className="w-5 h-5 text-black" />
            </div>
            <div>
              <p className="text-[10px] font-heading font-black text-black/60 uppercase tracking-widest">Completed</p>
              <p className="text-2xl font-heading font-black text-black mt-0.5">{totalCompleted}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-brand-pink border-2 border-black rounded-2xl shadow-[4px_4px_0px_#000000] transition-transform hover:translate-y-[-1px]">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-canvas border-2 border-black text-black shadow-[2px_2px_0px_#000000]">
              <XCircle className="w-5 h-5 text-black" />
            </div>
            <div>
              <p className="text-[10px] font-heading font-black text-black/60 uppercase tracking-widest">Failed Queue</p>
              <p className="text-2xl font-heading font-black text-black mt-0.5">{totalError}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Dropzone */}
      <div 
        {...getRootProps()} 
        className={cn(
          "border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer relative overflow-hidden group outline-none transition-all duration-200 border-black",
          isDragActive 
            ? "bg-brand-peach/20 shadow-[6px_6px_0px_#000000]" 
            : "bg-surface-soft hover:bg-surface-card hover:scale-[1.002] active:scale-[0.998] shadow-[4px_4px_0px_#000000] hover:shadow-[6px_6px_0px_#000000]"
        )}
      >
        <input {...getInputProps()} />
        <div className="absolute inset-0 bg-brand-peach/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        <div className="relative z-10 space-y-4">
          <div className="w-16 h-16 bg-canvas rounded-2xl flex items-center justify-center mx-auto border-2 border-black shadow-[3px_3px_0px_#000000] group-hover:scale-110 transition-transform duration-300">
            <CloudUpload className="w-8 h-8 text-black" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-heading font-black text-black group-hover:text-black transition-colors">
              {isDragActive ? 'Drop your files now!' : 'Drag & drop files here'}
            </h3>
            <p className="text-[#5a5a5a] text-xs md:text-sm max-w-md mx-auto leading-relaxed font-heading font-bold">
              Or click to browse from your device. Files larger than <span className="text-brand-pink font-extrabold">1GB</span> are automatically split and distributed.
            </p>
          </div>
          <div className="pt-2">
            <span className="inline-flex bg-black hover:bg-zinc-800 text-white border-2 border-black px-5 py-2.5 rounded-xl text-xs font-heading font-black shadow-[2px_2px_0px_rgba(0,0,0,0.15)] flex items-center gap-1.5 mx-auto w-fit">
              Browse Files <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>

      {/* Upload Queue Card */}
      <AnimatePresence>
        {uploads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-surface-card border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] overflow-hidden">
              <CardHeader className="border-b-2 border-black py-4.5 bg-surface-soft">
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-base font-heading font-black text-black">Upload Queue</CardTitle>
                    <CardDescription className="text-xs text-[#5a5a5a] font-heading font-bold mt-0.5">Track your sequential file distribution activity.</CardDescription>
                  </div>
                  <button 
                    onClick={() => setUploads([])}
                    className="text-xs font-heading font-black text-black bg-canvas border-2 border-black hover:bg-surface-soft px-3 py-1.5 rounded-xl transition-colors shadow-[2px_2px_0px_#000000] cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0 divide-y-2 divide-black/10 bg-canvas/30">
                <AnimatePresence initial={false}>
                  {uploads.map((upload) => (
                    <motion.div 
                      key={upload.id} 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-5 flex items-center gap-4 bg-canvas/30 hover:bg-canvas/80 transition-colors"
                    >
                      <div className="bg-canvas p-2.5 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000000]">
                        <FileIcon className="w-5 h-5 text-black" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-2">
                          <span className="text-sm font-heading font-black text-black truncate pr-4">{upload.file.name}</span>
                          <span className="text-xs text-black/70 font-black flex-shrink-0 font-mono">{formatBytes(upload.file.size)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Progress 
                            value={upload.progress} 
                            className="flex-1 h-2.5 bg-surface-soft border border-black/15 rounded-full overflow-hidden" 
                            indicatorClassName={cn(
                              "transition-all duration-300 border-r border-black/20",
                              upload.status === 'error' ? 'bg-brand-pink' : 
                              upload.status === 'completed' ? 'bg-brand-mint' : 
                              'bg-brand-peach'
                            )} 
                          />
                          <span className="text-xs font-heading font-black text-black w-8 text-right font-mono">{upload.progress}%</span>
                        </div>
                        {upload.status === 'error' && (
                          <p className="text-xs text-brand-pink font-bold mt-1.5 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0" /> {upload.errorMessage}
                          </p>
                        )}
                      </div>
                      <div className="w-10 flex justify-center flex-shrink-0">
                        {upload.status === 'completed' && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <CheckCircle2 className="w-5 h-5 text-black fill-brand-mint" />
                          </motion.div>
                        )}
                        {upload.status === 'error' && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <XCircle className="w-5 h-5 text-brand-pink" />
                          </motion.div>
                        )}
                        {upload.status === 'uploading' && (
                          <Loader2 className="w-4 h-4 text-black animate-spin" />
                        )}
                        {upload.status === 'pending' && (
                          <span className="text-[10px] text-[#5a5a5a] font-heading font-black uppercase tracking-wider">Queue</span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
