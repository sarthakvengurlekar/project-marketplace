export default function FeedLoading() {
  return (
    <main className="min-h-screen bg-zinc-950 pb-16">
      {/* Header skeleton */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 px-4 py-3">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center">
                <span className="text-xs font-black text-black">PT</span>
              </div>
              <span className="text-white font-black text-base tracking-tight">projecttrading</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-3 bg-zinc-800 rounded animate-pulse" />
              <div className="w-14 h-3 bg-zinc-800 rounded animate-pulse" />
              <div className="w-14 h-3 bg-zinc-800 rounded animate-pulse" />
            </div>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex-1 h-8 bg-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-10 bg-zinc-800 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Card skeletons */}
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
            <div className="p-4 pb-3">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-zinc-800 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-3 bg-zinc-800 rounded animate-pulse" />
                  <div className="w-48 h-2.5 bg-zinc-800 rounded animate-pulse" />
                  <div className="w-20 h-2.5 bg-zinc-800 rounded animate-pulse" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-4 pb-4">
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="flex-shrink-0 w-[72px]">
                  <div className="w-[72px] h-[100px] rounded-xl bg-zinc-800 animate-pulse" />
                  <div className="w-full h-2 bg-zinc-800 rounded mt-1 animate-pulse" />
                </div>
              ))}
            </div>
            <div className="border-t border-zinc-800">
              <div className="h-12 bg-zinc-900 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
