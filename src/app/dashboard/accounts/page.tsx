import { supabaseAdmin } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes, cn } from '@/lib/utils';
import { HardDrive, Mail, Database, HelpCircle, PlusCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const { data: accounts } = await supabaseAdmin
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: true });

  const totalAccounts = accounts?.length || 0;
  
  // Each Google Drive free tier account has a fixed 15 GB quota
  const G_LIMIT = 15 * 1024 * 1024 * 1024; // 15 GB in bytes
  const totalLimit = totalAccounts * G_LIMIT;

  // Calculate used storage for each account dynamically (15GB - remaining_storage)
  const totalUsed = accounts?.reduce((sum, acc) => {
    const remaining = Number(acc.remaining_storage || 0);
    const used = Math.max(0, G_LIMIT - remaining);
    return sum + used;
  }, 0) || 0;

  const percentUsed = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;

  // Saturated color classes for individual drive account nodes (loops dynamically)
  const cardSaturatedColors = [
    { bg: 'bg-brand-peach', text: 'text-black' },
    { bg: 'bg-brand-lavender', text: 'text-black' },
    { bg: 'bg-brand-mint', text: 'text-black' }
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto font-sans antialiased">
      {/* Page Title & Add Account Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight text-black" style={{ letterSpacing: '-0.8px' }}>
            Accounts Pool Node
          </h1>
          <p className="text-[#5a5a5a] mt-1 text-sm font-heading font-bold">
            Monitor and expand your unified distributed cloud storage pool. No limits on connected accounts.
          </p>
        </div>
        <Link
          href="/api/auth/google"
          className="inline-flex items-center gap-2 bg-black hover:bg-zinc-800 text-white border-2 border-black px-5 py-3 rounded-xl text-sm font-heading font-black shadow-[3px_3px_0px_rgba(0,0,0,0.15)] hover:translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_rgba(0,0,0,0.15)] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer w-fit self-start sm:self-center"
        >
          <PlusCircle className="w-4 h-4" /> Connect Google Account
        </Link>
      </div>

      {/* Unified Storage Card */}
      <Card className="bg-surface-card border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] overflow-hidden">
        <CardHeader className="bg-surface-soft border-b-2 border-black py-5">
          <div className="flex items-center gap-3">
            <div className="bg-canvas p-2.5 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000000]">
              <Database className="w-5 h-5 text-black" />
            </div>
            <div>
              <CardTitle className="text-base font-heading font-black text-black">Total Aggregated Pool Capacity</CardTitle>
              <CardDescription className="text-xs text-[#5a5a5a] font-heading font-bold mt-0.5">
                Unified NAS virtual storage volume across {totalAccounts} active {totalAccounts === 1 ? 'shard' : 'shards'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5 bg-canvas/20">
          <div className="flex justify-between items-end">
            <div>
              <span className="text-3xl font-black text-black font-mono">{formatBytes(totalUsed)}</span>
              <span className="text-xs text-[#5a5a5a] font-black ml-1.5 uppercase tracking-wider">used of {formatBytes(totalLimit)}</span>
            </div>
            <div className="bg-brand-peach border-2 border-black px-3.5 py-1.5 rounded-xl font-heading font-black text-xs text-black shadow-[2px_2px_0px_#000000]">
              {percentUsed}% Filled
            </div>
          </div>
          
          <div className="space-y-2">
            <Progress 
              value={percentUsed} 
              className="h-4.5 bg-surface-soft border-2 border-black rounded-full overflow-hidden" 
              indicatorClassName="bg-brand-teal" 
            />
            <div className="flex justify-between text-[11px] text-[#5a5a5a] font-black uppercase tracking-wider">
              <span>0 GB</span>
              <span>Remaining: {formatBytes(totalLimit - totalUsed)}</span>
              <span>{formatBytes(totalLimit)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Cards - Multi-color Cards */}
      {totalAccounts > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(accounts || []).map((account, idx) => {
            const color = cardSaturatedColors[idx % cardSaturatedColors.length];
            const remaining = Number(account.remaining_storage || 0);
            const used = Math.max(0, G_LIMIT - remaining);
            const pct = Math.round((used / G_LIMIT) * 100);

            return (
              <Card 
                key={account.id} 
                className={cn(
                  "border-2 border-black rounded-2xl shadow-[4px_4px_0px_#000000] overflow-hidden flex flex-col min-h-[360px] transition-all hover:translate-y-[-1px] hover:shadow-[6px_6px_0px_#000000]",
                  color.bg,
                  color.text
                )}
              >
                <CardHeader className="p-5 pb-4 border-b-2 border-black bg-canvas/30">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="bg-canvas p-2 rounded-xl border-2 border-black shadow-[2px_2px_0px_#000000]">
                        <HardDrive className="w-4 h-4 text-black" />
                      </div>
                      <span className="font-heading font-black text-sm text-black">Node Drive #{idx + 1}</span>
                    </div>
                    
                    <span className="inline-flex items-center gap-1.5 bg-brand-mint text-black font-heading font-black text-[10px] uppercase tracking-wider border-2 border-black px-2 py-0.5 rounded-full shadow-[1.5px_1.5px_0px_#000000]">
                      <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse border border-black" /> Connected
                    </span>
                  </div>
                </CardHeader>
                
                <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    {/* Email profile */}
                    <div className="bg-canvas border-2 border-black p-3 rounded-xl shadow-[2px_2px_0px_#000000] flex items-center gap-2.5">
                      <Mail className="w-4 h-4 text-black flex-shrink-0" />
                      <span className="text-xs font-black text-black truncate block" title={account.email}>
                        {account.email}
                      </span>
                    </div>

                    {/* Info details */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-black text-black">
                        <span>Capacity Used:</span>
                        <span className="font-mono">{formatBytes(used)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-black text-black">
                        <span>Max Allotted:</span>
                        <span className="font-mono">{formatBytes(G_LIMIT)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Progress tracking inside card */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-heading font-black uppercase tracking-widest text-black/70">Allocation Capacity</span>
                      <span className="text-xs font-black font-mono text-black">{pct}%</span>
                    </div>
                    <Progress 
                      value={pct} 
                      className="h-3 bg-canvas border-2 border-black rounded-full overflow-hidden" 
                      indicatorClassName="bg-black" 
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-12 bg-surface-card border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] min-h-[300px]">
          <HelpCircle className="w-14 h-14 text-black/40 mb-3" />
          <h3 className="text-lg font-heading font-black text-black">No accounts connected yet</h3>
          <p className="text-sm text-[#5a5a5a] max-w-sm mt-1 leading-relaxed font-bold">
            Add Google Drive accounts to initialize your high-speed distributed storage pool volume.
          </p>
          <Link
            href="/api/auth/google"
            className="inline-flex items-center gap-2 bg-black hover:bg-zinc-800 text-white border-2 border-black px-6 py-3 rounded-xl text-sm font-heading font-black shadow-[3px_3px_0px_rgba(0,0,0,0.15)] hover:translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_rgba(0,0,0,0.15)] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer mt-6"
          >
            <PlusCircle className="w-4 h-4" /> Connect Your First Account
          </Link>
        </div>
      )}
    </div>
  );
}
