export default function FeedLoading() {
  return (
    <main className="min-h-screen pb-28" style={{ background: '#FAF6EC' }}>

      {/* Header skeleton */}
      <div className="sticky top-0 z-20 px-4 py-3" style={{ background: '#FAF6EC', borderBottom: '2px solid #0A0A0A' }}>
        <div className="max-w-lg mx-auto space-y-3">

          {/* Nav row */}
          <div className="flex items-center justify-between">
            <div>
              <div className="h-5 w-28 rounded animate-pulse" style={{ background: '#e8e2d4' }} />
              <div className="h-3 w-20 rounded animate-pulse mt-1.5" style={{ background: '#e8e2d4' }} />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-3 w-12 rounded animate-pulse" style={{ background: '#e8e2d4' }} />
              <div className="h-3 w-16 rounded animate-pulse" style={{ background: '#e8e2d4' }} />
              <div className="w-9 h-9 animate-pulse" style={{ background: '#e8e2d4', border: '2px solid #0A0A0A' }} />
            </div>
          </div>

          {/* Country tabs */}
          <div className="grid grid-cols-3 overflow-hidden" style={{ border: '2px solid #0A0A0A' }}>
            {[1, 2, 3].map((i, idx, arr) => (
              <div
                key={i}
                className="h-9 animate-pulse"
                style={{
                  background: '#e8e2d4',
                  borderRight: idx < arr.length - 1 ? '2px solid #0A0A0A' : 'none',
                }}
              />
            ))}
          </div>

          {/* Search bar */}
          <div className="h-11 animate-pulse" style={{ background: '#e8e2d4', border: '2px solid #0A0A0A' }} />
        </div>
      </div>

      {/* Seller card skeletons */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="overflow-hidden animate-pulse"
            style={{ background: '#FAF6EC', border: '2px solid #0A0A0A', boxShadow: '4px 4px 0 #E8233B' }}
          >
            {/* Profile header */}
            <div className="p-4 pb-3" style={{ borderBottom: '2px solid #0A0A0A' }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex-shrink-0" style={{ background: '#e8e2d4', border: '2px solid #0A0A0A' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded" style={{ background: '#e8e2d4' }} />
                  <div className="h-2.5 w-48 rounded" style={{ background: '#e8e2d4' }} />
                  <div className="h-2.5 w-20 rounded" style={{ background: '#e8e2d4' }} />
                </div>
              </div>
            </div>

            {/* Card strip */}
            <div className="flex gap-2 px-4 py-3" style={{ borderBottom: '2px solid #0A0A0A' }}>
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="flex-shrink-0 w-[72px]">
                  <div className="w-[72px] h-[100px]" style={{ background: '#e8e2d4', border: '2px solid #0A0A0A' }} />
                  <div className="h-2 w-full rounded mt-1" style={{ background: '#e8e2d4' }} />
                </div>
              ))}
            </div>

            {/* View collection */}
            <div className="px-4 py-2.5" style={{ borderBottom: '2px solid #0A0A0A' }}>
              <div className="h-3 w-36 rounded" style={{ background: '#e8e2d4' }} />
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-2">
              <div className="h-14" style={{ background: '#e8e2d4', borderRight: '2px solid #0A0A0A' }} />
              <div className="h-14" style={{ background: '#e8e2d4' }} />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
