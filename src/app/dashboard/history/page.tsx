import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, CheckCircle, Clock, AlertCircle, Search, Filter } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { getFileIconInfo } from '@/lib/file-icons';
import { formatDistanceToNow } from 'date-fns';
import { supabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; limit?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const searchQuery = resolvedSearchParams.q || '';
  const filterStatus = resolvedSearchParams.status || 'all';
  const limit = parseInt(resolvedSearchParams.limit || '50', 10);

  // Fetch history securely from Supabase using the service role client.
  // We request `limit + 1` rows to determine `hasMore` without a costly exact count query.
  let query = supabaseAdmin
    .from('files')
    .select('*')
    .order('upload_date', { ascending: false });

  if (searchQuery) {
    query = query.ilike('original_file_name', `%${searchQuery}%`);
  }

  if (filterStatus !== 'all') {
    query = query.eq('status', filterStatus);
  }

  // Set the query limit to limit + 1
  query = query.limit(limit + 1);

  const { data: files, error } = await query;
  
  if (error) {
    console.error('Error fetching upload history:', error);
  }

  const rawHistory = files || [];
  const hasMore = rawHistory.length > limit;
  const filteredHistory = hasMore ? rawHistory.slice(0, limit) : rawHistory;
  const nextLimit = limit + 50;

  return (
    <div className="space-y-8 max-w-6xl mx-auto font-sans antialiased">
      <div>
        <h1 className="text-3xl font-heading font-black tracking-tight text-black" style={{ letterSpacing: '-0.8px' }}>
          Upload History
        </h1>
        <p className="text-[#5a5a5a] mt-1 text-sm font-heading font-bold">
          Review your recent file activities, upload status, and distributed storage mapping.
        </p>
      </div>

      <form method="GET" action="/dashboard/history" className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5a5a5a]" />
          <input
            type="text"
            name="q"
            placeholder="Search history..."
            className="w-full bg-white border-2 border-black rounded-xl py-2.5 pl-10 pr-4 text-sm font-heading font-bold shadow-[3px_3px_0px_#000000] focus:translate-y-[1px] focus:shadow-[2px_2px_0px_#000000] transition-all outline-none"
            defaultValue={searchQuery}
          />
        </div>
        <div className="flex gap-2">
          <select
            name="status"
            className="bg-white border-2 border-black rounded-xl px-4 py-2.5 text-sm font-heading font-black shadow-[3px_3px_0px_#000000] outline-none cursor-pointer"
            defaultValue={filterStatus}
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="uploading">Uploading</option>
            <option value="failed">Failed</option>
          </select>
          {limit !== 50 && <input type="hidden" name="limit" value={limit} />}
          <button
            type="submit"
            className="bg-black hover:bg-zinc-800 text-white border-2 border-black px-6 py-2.5 rounded-xl font-heading font-black text-sm shadow-[3px_3px_0px_#000000] hover:translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_#000000] active:translate-y-[1.5px] active:shadow-none cursor-pointer transition-all flex items-center gap-2"
          >
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
      </form>

      <Card className="bg-surface-card border-2 border-black rounded-2xl overflow-hidden shadow-[8px_8px_0px_#000000]">
        <CardHeader className="bg-surface-soft border-b-2 border-black py-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-canvas border-2 border-black text-black shadow-[2px_2px_0px_#000000]">
              <History className="w-5 h-5 text-black" />
            </div>
            <div>
              <CardTitle className="text-black text-base font-heading font-black">Recent Activities</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 bg-canvas/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-black/5 text-[11px] font-heading font-black uppercase tracking-wider text-[#5a5a5a] bg-surface-soft/30">
                  <th className="px-6 py-4">File Name</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Size</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Allocation</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black/5">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <p className="text-sm font-heading font-bold text-[#5a5a5a]">No activities found matching your criteria.</p>
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((item) => {
                    const iconInfo = getFileIconInfo(item.mime_type, item.original_file_name);
                    const Icon = iconInfo.icon;
                    return (
                      <tr key={item.id} className="hover:bg-surface-soft/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div 
                              className="p-2 rounded-lg border-2 border-black shadow-[2px_2px_0px_#000000] group-hover:translate-y-[-1px] transition-transform"
                              style={{ backgroundColor: iconInfo.bgColor }}
                            >
                              <Icon className="w-4 h-4" style={{ color: iconInfo.textColor }} />
                            </div>
                            <span className="text-sm font-heading font-black text-black truncate max-w-[240px]">
                              {item.original_file_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {item.status === 'completed' ? (
                            <div className="flex items-center gap-1.5 text-success font-heading font-black text-[10px] uppercase border-2 border-success/20 bg-success/5 px-2 py-1 rounded-full w-fit">
                              <CheckCircle className="w-3 h-3" />
                              Success
                            </div>
                          ) : item.status === 'failed' ? (
                            <div className="flex items-center gap-1.5 text-brand-pink font-heading font-black text-[10px] uppercase border-2 border-brand-pink/20 bg-brand-pink/5 px-2 py-1 rounded-full w-fit">
                              <AlertCircle className="w-3 h-3" />
                              Failed
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-brand-peach font-heading font-black text-[10px] uppercase border-2 border-brand-peach/20 bg-brand-peach/5 px-2 py-1 rounded-full w-fit">
                              <Clock className="w-3 h-3 animate-spin" />
                              {item.status}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-[#5a5a5a]">
                          {formatBytes(item.size)}
                        </td>
                        <td className="px-6 py-4 text-xs font-heading font-bold text-[#5a5a5a]">
                          {formatDistanceToNow(new Date(item.upload_date), { addSuffix: true })}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-mono font-black bg-black text-white px-2 py-0.5 rounded border border-black shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.3)]">
                            {item.total_parts} Shard{item.total_parts > 1 ? 's' : ''}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {hasMore && (
        <div className="flex justify-center mt-6">
          <Link
            href={`/dashboard/history?q=${searchQuery}&status=${filterStatus}&limit=${nextLimit}`}
            className="bg-black hover:bg-zinc-800 text-white border-2 border-black px-8 py-3 rounded-xl font-heading font-black text-sm shadow-[4px_4px_0px_#000000] hover:translate-y-[0.5px] hover:shadow-[3.5px_3.5px_0px_#000000] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer flex items-center gap-2"
          >
            <Clock className="w-4 h-4 animate-pulse" />
            Load More Shards
          </Link>
        </div>
      )}
    </div>
  );
}
