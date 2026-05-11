'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Download, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

export default function DownloadPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fileData, setFileData] = useState<any>(null);
  const [parts, setParts] = useState<any[]>([]);
  
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'downloading' | 'completed' | 'error'>('idle');

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

  useEffect(() => {
    async function init() {
      const trace = generateW3CTrace();
      const traceparent = `00-${trace.traceId}-${trace.spanId}-01`;

      try {
        const res = await fetch(`/api/download/${fileId}/init`, {
          headers: {
            'traceparent': traceparent,
          },
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to init download');
        }
        const data = await res.json();
        setFileData(data.file);
        setParts(data.parts);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [fileId]);

  const handleDownload = async () => {
    if (!fileData || parts.length === 0) return;
    
    setDownloading(true);
    setStatus('downloading');
    setProgress(0);

    const downloadSessionTrace = generateW3CTrace();
    const traceparent = `00-${downloadSessionTrace.traceId}-${downloadSessionTrace.spanId}-01`;

    let downloadedBytes = 0;
    let transferStarted = false;

    try {
      await pushTelemetry('download_attempt', { file_id: fileId, file_name: fileData.name, total_parts: parts.length });

      // Dynamically import streamsaver to bypass server-side Node evaluation (SSR)
      // @ts-ignore
      const streamSaver = (await import('streamsaver')).default;

      // 1. Create a StreamSaver write stream
      const fileStream = streamSaver.createWriteStream(fileData.name, {
        size: fileData.size,
      });

      const writer = fileStream.getWriter();
      transferStarted = true;

      // 2. Fetch and pipe each part sequentially
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        // Fetch fresh access token right before downloading the chunk, propagating the download session trace
        const tokenRes = await fetch(`/api/download/${fileId}/token?partNumber=${part.partNumber}`, {
          headers: {
            'traceparent': traceparent,
          },
        });
        if (!tokenRes.ok) {
          await pushTelemetry('download_token_failure', { file_id: fileId, part_number: part.partNumber });
          const errData = await tokenRes.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to retrieve access token for chunk ${part.partNumber}`);
        }
        const { accessToken } = await tokenRes.json();
        
        // Fetch from Google Drive API directly
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${part.googleDriveFileId}?alt=media`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (!res.ok || !res.body) {
          throw new Error(`Failed to fetch part ${part.partNumber}`);
        }

        const reader = res.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          await writer.write(value);
          downloadedBytes += value.length;
          
          setProgress(Math.round((downloadedBytes / fileData.size) * 100));
        }
      }

      await writer.close();

      // Check stream integrity / corruption rate
      if (downloadedBytes !== fileData.size) {
        await pushTelemetry('download_corruption', { file_id: fileId, expected_bytes: fileData.size, actual_bytes: downloadedBytes });
        throw new Error(`Data stream integrity error: bytes received (${downloadedBytes}) do not match file manifest (${fileData.size})`);
      }

      setStatus('completed');
    } catch (err: any) {
      console.error('Download error:', err);
      if (transferStarted) {
        await pushTelemetry('download_interruption', { file_id: fileId, downloaded_bytes: downloadedBytes, expected_bytes: fileData.size });
      }
      setError(err.message);
      setStatus('error');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-10 h-10 text-black animate-spin" />
        <span className="text-sm font-heading font-black text-[#5a5a5a] uppercase tracking-wider">
          Initializing distributed download session...
        </span>
      </div>
    );
  }

  if (error && status === 'idle') {
    return (
      <div className="text-center p-8 bg-surface-card border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] max-w-md mx-auto space-y-4 font-sans antialiased">
        <AlertCircle className="w-12 h-12 text-brand-pink mx-auto" />
        <h2 className="text-xl font-heading font-black text-black">Download Initialization Failed</h2>
        <p className="text-sm text-[#5a5a5a] font-heading font-bold">{error}</p>
        <button 
          onClick={() => router.back()}
          className="bg-black hover:bg-zinc-800 text-white border-2 border-black px-5 py-2.5 rounded-xl text-xs font-heading font-black shadow-[2px_2px_0px_rgba(0,0,0,0.15)] hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.15)] active:translate-y-[1.5px] active:shadow-none cursor-pointer inline-flex items-center gap-1.5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 font-sans antialiased">
      <button 
        onClick={() => router.back()} 
        className="bg-canvas border-2 border-black hover:bg-surface-soft text-black font-heading font-black rounded-xl shadow-[2px_2px_0px_#000000] px-3.5 py-2 text-xs flex items-center gap-1.5 hover:translate-y-[0.5px] hover:shadow-[1.5px_1.5px_0px_#000000] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Files
      </button>

      <Card className="bg-surface-card border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] overflow-hidden">
        <CardHeader className="bg-surface-soft border-b-2 border-black py-5">
          <div className="flex items-center gap-3">
            <div className="bg-canvas p-2.5 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000000]">
              <Download className="w-5 h-5 text-black" />
            </div>
            <div>
              <CardTitle className="text-base font-heading font-black text-black">Download Distributed File</CardTitle>
              <CardDescription className="text-xs text-[#5a5a5a] font-heading font-bold mt-0.5">
                Pipes, decrypts, and streams multiple Google Drive storage shards as a single contiguous stream.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 space-y-6 bg-canvas/20">
          <div className="bg-canvas border-2 border-black p-6 rounded-xl shadow-[3px_3px_0px_#000000] flex flex-col items-center text-center">
            <h3 className="text-lg font-heading font-black text-black mb-1.5 truncate max-w-full" title={fileData?.original_file_name || fileData?.name}>
              {fileData?.original_file_name || fileData?.name}
            </h3>
            <div className="flex space-x-3 text-xs text-[#5a5a5a] font-mono font-black uppercase tracking-wider">
              <span>{formatBytes(fileData?.size || 0)}</span>
              <span>•</span>
              <span>{fileData?.is_split || fileData?.isSplit ? `Split (${fileData?.total_parts || fileData?.totalParts} parts)` : 'Single part'}</span>
            </div>
          </div>

          {(status === 'downloading' || status === 'completed' || status === 'error') && (
            <div className="space-y-2 bg-canvas border-2 border-black p-4 rounded-xl shadow-[2px_2px_0px_rgba(0,0,0,0.15)]">
              <div className="flex justify-between text-xs font-heading font-black text-black">
                <span>
                  {status === 'downloading' ? 'Streaming and merging cloud parts...' : 
                   status === 'completed' ? 'Download stream completed!' : 'Download stream failed'}
                </span>
                <span className="font-mono">{progress}%</span>
              </div>
              <Progress 
                value={progress} 
                className="h-4.5 bg-surface-soft border-2 border-black rounded-full overflow-hidden" 
                indicatorClassName={
                  status === 'error' ? 'bg-brand-pink' : 
                  status === 'completed' ? 'bg-brand-mint' : 'bg-brand-teal'
                } 
              />
              {status === 'error' && (
                <p className="text-brand-pink text-xs font-heading font-bold mt-2 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Error: {error}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-center pt-2">
            {status !== 'completed' ? (
              <button 
                onClick={handleDownload} 
                disabled={downloading}
                className="w-full bg-black hover:bg-zinc-800 text-white border-2 border-black px-6 py-3 rounded-xl font-heading font-black text-sm shadow-[3px_3px_0px_rgba(0,0,0,0.15)] hover:translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_rgba(0,0,0,0.15)] active:translate-y-[1.5px] active:shadow-none cursor-pointer flex items-center justify-center gap-2 transition-all disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing Stream...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Start Download Stream
                  </>
                )}
              </button>
            ) : (
              <button 
                onClick={() => router.push('/dashboard/files')}
                className="w-full bg-brand-mint text-black border-2 border-black hover:bg-emerald-400 px-6 py-3 rounded-xl font-heading font-black text-sm shadow-[3px_3px_0px_#000000] hover:translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_#000000] active:translate-y-[1.5px] active:shadow-none cursor-pointer flex items-center justify-center gap-2 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" /> Done
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
