import { useParams } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'

interface ProfilePageProps {
  tab: 'posts' | 'replies' | 'media' | 'likes' | 'followers' | 'following'
}

export default function ProfilePage({ tab }: ProfilePageProps) {
  const { handle } = useParams<{ handle: string }>()
  return (
    <EmptyState
      title={`@${handle ?? 'user'} — ${tab}`}
      description="Profile pages — coming in Phase 4."
    />
  )
}
