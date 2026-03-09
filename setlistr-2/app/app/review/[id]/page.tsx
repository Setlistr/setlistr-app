'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Plus, Trash2, Upload, GripVertical, Check } from 'lucide-react'
import type { Performance, PerformanceSong } from '@/types'

export default function ReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [songs, setSongs] = useState<PerformanceSong[]>([])
  const [newSong, setNewSong] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [proofUrl, setProofUrl] = useState('')
  const [proofName, setProofName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('performances').select('*').eq('id', params.id).single()
      .then(({ data }) => { if (data) setPerformance(data) })
    supabase.from('performance_songs').select('*').eq('performance_id', params.id).order('position')
      .then(({ data }) => { if (data) setSongs(data) })
  }, [params.id])

  function addSong() {
    const t = newSong.trim()
    if (!t) return
    const newEntry: PerformanceSong = {
      id: `temp-${Date.now()}`,
      performance_id: params.id,
      title: t,
      artist: performance?.artist_name ?? null,
      position: songs.length + 1,
      duration_seconds: null,
      notes: null,
    }
    setSongs(s => [...s, newEntry])
    setNewSong('')
  }

  function removeSong(id: string) {
    setSongs(s => s.filter(x => x.id !== id).map((x, i) => ({ ...x, position: i + 1 })))
  }

  function editSong(id: string, title: string) {
    setSongs(s => s.map(x => x.id === id ? { ...x, title } : x))
  }

  async function uploadProof(file: File) {
    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${params.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('performance-proofs').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('performance-proofs').getPublicUrl(path)
      setProofUrl(data.publicUrl)
      setProofName(file.name)
      await supabase.from('attachments').insert({
        performance_id: params.id,
        url: data.publicUrl,
        filename: file.name,
        file_type: file.type,
      })
    }
    setUploading(false)
  }

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()

    // Delete old songs and reinsert
    await supabase.from('performance_songs').delete().eq('performance_id', params.id)
    if (songs.length > 0) {
      await supabase.from('performance_songs').insert(
        songs.map((s, i) => ({
          performance_id: params.id,
          title: s.title,
          artist: s.artist ?? performance?.artist_name,
          position: i + 1,
          duration_seconds: s.duration_seconds,
          notes: s.notes,
        }))
      )
    }

    await supabase.from('performances').update({ status: 'complete' }).eq('id', params.id)
    router.push('/app/performances/history')
  }

  if (!performance) {
    return <div className="flex items-center justify-center min-h-screen text-ink-light">Loading...</div>
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-ink-light hover:text-ink">
          <ChevronLeft size={22} />
        </button>
        <div>
          <p className="text-xs text-ink-light uppercase tracking-[0.2em]">Review Performance</p>
          <h1 className="font-display text-2xl text-ink">{performance.venue_name}</h1>
        </div>
      </div>

      {/* Show details */}
      <div className="bg-white border border-cream-dark rounded-2xl p-4 mb-6 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-ink-light">Artist</span><div className="font-medium text-ink">{performance.artist_name}</div></div>
          <div><span className="text-ink-light">Date</span><div className="font-medium text-ink">{new Date(performance.performance_date).toLocaleDateString()}</div></div>
          <div><span className="text-ink-light">City</span><div className="font-medium text-ink">{performance.city}</div></div>
          <div><span className="text-ink-light">Duration</span><div className="font-medium text-ink">{performance.set_duration_minutes} min</div></div>
        </div>
      </div>

      {/* Setlist */}
      <div className="mb-6">
        <h2 className="font-semibold text-ink mb-3">Setlist <span className="text-ink-light font-normal text-sm">({songs.length} songs)</span></h2>

        {songs.length === 0 && (
          <div className="text-center py-8 text-ink-light text-sm border border-dashed border-cream-dark rounded-2xl mb-3">
            No songs yet — add them below
          </div>
        )}

        <div className="flex flex-col gap-2 mb-3">
          {songs.map((song, i) => (
            <div key={song.id} className="flex items-center gap-3 bg-white border border-cream-dark rounded-xl px-3 py-2.5">
              <GripVertical size={14} className="text-ink-light/40 shrink-0" />
              <span className="text-gold font-mono text-xs w-5 shrink-0">{i + 1}</span>
              <input
                value={song.title}
                onChange={e => editSong(song.id, e.target.value)}
                className="flex-1 text-sm text-ink focus:outline-none bg-transparent"
              />
              <button onClick={() => removeSong(song.id)} className="text-ink-light/40 hover:text-red-500 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Add song */}
        <div className="flex gap-2">
          <input
            value={newSong}
            onChange={e => setNewSong(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSong()}
            placeholder="Add a song..."
            className="flex-1 bg-white border border-cream-dark rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-light/50 focus:outline-none focus:border-gold"
          />
          <button onClick={addSong} className="bg-ink text-cream rounded-xl px-4 py-2.5">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Proof upload */}
      <div className="mb-8">
        <h2 className="font-semibold text-ink mb-3">Proof of Performance</h2>
        <input ref={fileRef} type="file" accept="image/*,video/*,.pdf" className="hidden"
          onChange={e => e.target.files?.[0] && uploadProof(e.target.files[0])} />

        {proofUrl ? (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <Check size={16} className="text-green-600" />
            <span className="text-sm text-green-800">{proofName}</span>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-cream-dark rounded-xl py-6 text-ink-light hover:border-gold hover:text-gold transition-colors">
            <Upload size={18} />
            <span className="text-sm">{uploading ? 'Uploading...' : 'Upload photo, video, or PDF'}</span>
          </button>
        )}
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        className="flex items-center justify-center gap-2 w-full bg-gold hover:bg-gold-light disabled:opacity-50 text-ink font-bold rounded-2xl py-4 text-lg transition-colors">
        <Check size={20} />
        {saving ? 'Saving...' : 'Save Performance'}
      </button>
    </div>
  )
}
