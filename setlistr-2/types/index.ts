export type Role = 'artist' | 'admin'
export type PerformanceStatus = 'draft' | 'live' | 'processing' | 'review' | 'complete'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  artist_name: string | null
  role: Role
  avatar_url: string | null
  created_at: string
}

export interface Venue {
  id: string
  name: string
  city: string
  country: string
  created_at: string
}

export interface Performance {
  id: string
  user_id: string
  venue_id: string | null
  venue_name: string
  city: string
  country: string
  artist_name: string
  performance_date: string
  start_time: string
  set_duration_minutes: number
  auto_close_buffer_minutes: number
  status: PerformanceStatus
  started_at: string | null
  ended_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  venue?: Venue
  songs?: PerformanceSong[]
  attachments?: Attachment[]
}

export interface CaptureSession {
  id: string
  performance_id: string
  started_at: string
  ended_at: string | null
  status: 'active' | 'ended'
}

export interface PerformanceSong {
  id: string
  performance_id: string
  title: string
  artist: string | null
  position: number
  duration_seconds: number | null
  notes: string | null
}

export interface Attachment {
  id: string
  performance_id: string
  url: string
  filename: string
  file_type: string
  created_at: string
}
