export default function DashboardLoading() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto font-sans antialiased animate-pulse">
      {/* Title Skeleton */}
      <div className="space-y-2">
        <div className="h-9 w-64 bg-zinc-300 rounded-xl border-2 border-black shadow-[3px_3px_0px_#000000]" />
        <div className="h-4 w-96 bg-zinc-200 rounded-lg border-2 border-black/10" />
      </div>

      {/* Grid of Stats Cards Skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((idx) => (
          <div 
            key={idx} 
            className="bg-zinc-100 border-2 border-black rounded-2xl h-28 shadow-[4px_4px_0px_#000000] p-5 flex items-center gap-4"
          >
            <div className="w-12 h-12 bg-zinc-300 border-2 border-black rounded-xl shadow-[2px_2px_0px_#000000]" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-16 bg-zinc-300 rounded" />
              <div className="h-6 w-24 bg-zinc-400 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Massive Card Skeleton */}
      <div className="bg-zinc-50 border-2 border-black rounded-2xl shadow-[6px_6px_0px_#000000] overflow-hidden">
        {/* Header Shimmer */}
        <div className="p-6 bg-zinc-100 border-b-2 border-black flex items-center gap-4">
          <div className="w-10 h-10 bg-zinc-300 border-2 border-black rounded-xl shadow-[2px_2px_0px_#000000]" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-48 bg-zinc-400 rounded" />
            <div className="h-3 w-32 bg-zinc-300 rounded" />
          </div>
        </div>
        
        {/* Body Shimmer */}
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-end">
            <div className="space-y-2">
              <div className="h-8 w-44 bg-zinc-300 rounded" />
              <div className="h-3 w-28 bg-zinc-200 rounded" />
            </div>
            <div className="h-8 w-24 bg-zinc-300 border-2 border-black rounded-xl" />
          </div>

          <div className="space-y-3">
            <div className="h-5 bg-zinc-200 border-2 border-black rounded-full w-full" />
            <div className="flex justify-between">
              <div className="h-3 w-12 bg-zinc-200 rounded" />
              <div className="h-3 w-12 bg-zinc-200 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
