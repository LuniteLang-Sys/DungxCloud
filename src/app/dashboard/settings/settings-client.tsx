'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function SettingsClient() {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    const toastId = toast.loading('Synchronizing storage pool quotas...');

    try {
      const res = await fetch('/api/admin/accounts/sync', {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Sync endpoint failed');
      }

      const data = await res.json();
      if (data.success) {
        toast.success(`Storage quotas synchronized successfully across ${data.count} accounts!`, {
          id: toastId,
        });
      } else {
        toast.error(data.message || 'Synchronization failed', {
          id: toastId,
        });
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Internal server error'}`, {
        id: toastId,
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Button
      onClick={handleSync}
      disabled={syncing}
      className="w-full bg-ink hover:bg-zinc-800 text-white border-2 border-ink py-6 rounded-xl font-extrabold text-sm shadow-[3px_3px_0px_rgba(0,0,0,0.2)] hover:translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_rgba(0,0,0,0.2)] active:translate-y-[1.5px] active:shadow-none cursor-pointer flex items-center justify-center gap-2 transition-all group outline-none"
    >
      <RefreshCw className={`w-4 h-4 transition-transform duration-500 ${syncing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
      {syncing ? 'Synchronizing Pool...' : 'Sync Storage Pool Quotas'}
    </Button>
  );
}
