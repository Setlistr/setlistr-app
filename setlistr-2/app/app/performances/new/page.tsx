
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PerformancesNewRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/app/show/new')
  }, [router])

  return null
}
