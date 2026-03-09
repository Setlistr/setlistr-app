import { createServerSupabaseClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronLeft, Music, MapPin, Clock, Paperclip, Edit } from 'lucide-react'
import { notFound } from 'next/navigation'

export default async function PerformanceDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()

  const { data: performance } = await supabase
    .from('performances')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!performance) notFound()

  const { data: songs } = await supabase
    .from('performance_songs')
    .select('*')
    .eq('performance_id', params.id)
    .order('position')

  const { data: attachments } = await supabase
    .from('attachments')
    .select('*')
    .eq('performance_id', params.id)

  const statusColors: Record<string, string> = {
    draft: 'bg-zinc-100 text-zinc-600',
    live: 'bg-red-100 text-red-600',
    review: 'bg-blue-100 text-blue-700',
    complete: 'bg-green-100 text-green-800',
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/performances/history" className="text-ink-light hover:text-ink">
          <ChevronLeft size={22} />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl text-ink">{performance.venue_name}</h1>
          <div className="flex items-center gap-1 text-ink-light text-sm">
            <MapPin size={12} />
            <span>{performance.city}, {performance.country}</span>
          </div>
        </div>
        <span className={`text-xs font-medium px-3 py-1.5 rounded-full uppercase tracking-wider ${statusColors[performance.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
          {performance.status}
        </span>
      </div>

      {/* Meta */}
      <div className="bg-white border border-cream-dark rounded-2xl p-4 mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-ink-light text-xs uppercase tracking-wider mb-0.5">Artist</div>
            <div className="font-medium text-ink">{performance.artist_name}</div>
          </div>
          <div>
            <div className="text-ink-light text-xs uppercase tracking-wider mb-0.5">Date</div>
            <div className="font-medium text-ink">{new Date(performance.performance_date).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <div>
            <div className="text-ink-light text-xs uppercase tracking-wider mb-0.5">Start Time</div>
            <div className="font-medium text-ink">{performance.start_time}</div>
          </div>
          <div>
            <div className="text-ink-light text-xs uppercase tracking-wider mb-0.5">Duration</div>
            <div className="font-medium text-ink">{performance.set_duration_minutes} min</div>
          </div>
        </div>
        {performance.notes && (
          <div className="mt-4 pt-4 border-t border-cream-dark text-sm text-ink-light">{performance.notes}</div>
        )}
      </div>

      {/* Setlist */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-ink flex items-center gap-2">
            <Music size={16} className="text-gold" />
            Setlist
          </h2>
          {performance.status === 'review' && (
            <Link href={`/app/review/${performance.id}`}
              className="text-xs text-gold flex items-center gap-1">
              <Edit size={12} /> Edit
            </Link>
          )}
        </div>

        {!songs?.length ? (
          <div className="text-sm text-ink-light text-center py-6 border border-dashed border-cream-dark rounded-xl">
            No songs recorded
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {songs.map((song, i) => (
              <div key={song.id} className="flex items-center gap-3 bg-white border border-cream-dark rounded-xl px-4 py-3">
                <span className="text-gold font-mono text-xs w-5 shrink-0">{i + 1}</span>
                <span className="text-sm text-ink font-medium">{song.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-ink flex items-center gap-2 mb-3">
            <Paperclip size={16} className="text-gold" />
            Proof of Performance
          </h2>
          <div className="flex flex-col gap-2">
            {attachments.map(a => (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white border border-cream-dark rounded-xl px-4 py-3 hover:border-gold transition-colors text-sm text-gold">
                <Paperclip size={14} />
                {a.filename}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Action if in review */}
      {performance.status === 'review' && (
        <Link href={`/app/review/${performance.id}`}
          className="flex items-center justify-center gap-2 w-full bg-gold text-ink font-bold rounded-2xl py-4 transition-colors">
          Complete Review
        </Link>
      )}
    </div>
  )
}
