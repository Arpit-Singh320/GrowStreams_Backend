"use client"

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/growstreams-api'
import { useAccount } from '@gear-js/react-hooks'
// api used for questCampaigns load
import { ArrowRight, Eye, Heart } from 'lucide-react'

export default function CampaignDetailPage() {
  const params = useParams() as { slug?: string }
  const router = useRouter()
  const { account } = useAccount()
  const wallet = account?.decodedAddress || ''

  const [campaign, setCampaign] = useState<any | null>(null)
  const [quests, setQuests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const res = await api.quests.questCampaign(params.slug || '')
        if (mounted) {
          setCampaign((res as any)?.campaign || null)
          setQuests((res as any)?.quests || [])
        }
      } catch (err) {
        if (mounted) setCampaign(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [params.slug])

  const handleJoin = async () => {
    if (!wallet) return router.push('/app/quests')
    // Navigate to the Earn page — campaign quests are completed there
    router.push('/app/quests')
  }

  if (loading) return <div className="flex items-center justify-center h-40">Loading...</div>
  if (!campaign) return <div className="text-center text-provn-muted">Campaign not found</div>

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Banner */}
      <div className="rounded-xl overflow-hidden border border-provn-border bg-black/20">
        {campaign.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.banner_url} alt={campaign.title} className="w-full h-56 object-cover" />
        ) : (
          <div className="w-full h-56 bg-gradient-to-b from-black/10 to-black/40" />
        )}
        <div className="-mt-12 px-6 pb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-md bg-provn-surface border border-provn-border overflow-hidden flex-shrink-0">
              {campaign.icon ? (<img src={campaign.icon} alt={campaign.title} className="w-full h-full object-cover" />) : null}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block text-[11px] text-emerald-100 bg-emerald-900/10 border border-emerald-500 rounded-full px-2 py-0.5 font-semibold">{campaign.status || 'ACTIVE'}</span>
                {campaign.tags?.map && campaign.tags.slice(0,2).map((t:any)=> (
                  <span key={t} className="inline-block text-[11px] text-provn-muted bg-provn-bg/20 border border-provn-border rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
              <h1 className="text-xl font-bold">{campaign.title}</h1>
              <div className="flex items-center gap-4 mt-2">
                <div className="text-sm font-semibold text-emerald-400">{campaign.reward_summary || campaign.pool_amount || ''}</div>
                <div className="flex items-center gap-2 text-provn-muted text-sm">
                  <Eye className="w-4 h-4" /> <span>{campaign.views || 0}</span>
                </div>
                <div className="flex items-center gap-2 text-provn-muted text-sm">
                  <Heart className="w-4 h-4" /> <span>{campaign.likes || 0}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center">
              <button onClick={handleJoin} className="bg-emerald-400 text-black px-4 py-2 rounded-full font-semibold hover:brightness-95">Go to Earn</button>
            </div>
          </div>
        </div>
      </div>

      {/* Description + Requirements + How to Participate */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="bg-provn-surface border border-provn-border rounded-xl p-4">
            <h3 className="font-bold mb-2">Description</h3>
            <p className="text-provn-muted">{campaign.description}</p>
          </div>

          <div className="bg-provn-surface border border-provn-border rounded-xl p-4">
            <h3 className="font-bold mb-3">Campaign Quests</h3>
            <div className="mb-4">
              <button onClick={handleJoin} className="w-full bg-yellow-300 text-black rounded-full py-3 font-semibold">Complete Quests on Earn Page</button>
            </div>
            {quests.length === 0 && (
              <p className="text-sm text-provn-muted text-center py-2">No quests added yet.</p>
            )}
            <div className="space-y-2">
              {quests.map((q:any) => (
                <div key={q.slug || q.id} className="bg-provn-bg/30 border border-provn-border rounded-lg p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{q.title}</div>
                    <div className="text-xs text-provn-muted">{q.description?.slice(0,120)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-amber-200 font-semibold">+{q.seeds_reward ?? q.xp ?? 0} XP</div>
                    <Link href={`/app/quest/${q.slug || q.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-provn-surface border border-provn-border text-sm">Open</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="bg-provn-surface border border-provn-border rounded-xl p-4">
            <h4 className="font-semibold mb-2">Requirements</h4>
            <ul className="space-y-2 text-provn-muted text-sm">
              {(campaign.required_hashtags || []).map((h:string, i:number) => (
                <li key={h} className="flex items-start gap-2"><span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-900/10 rounded-full text-emerald-300 text-xs font-mono">{i+1}</span><span>{h}</span></li>
              ))}
              {(!campaign.required_hashtags || campaign.required_hashtags.length===0) && <li className="text-provn-muted">No special requirements</li>}
            </ul>
          </div>

          <div className="bg-provn-surface border border-provn-border rounded-xl p-4">
            <h4 className="font-semibold mb-2">How to Participate</h4>
            <ol className="list-decimal list-inside text-provn-muted text-sm space-y-2">
              <li>Click Join Campaign</li>
              <li>Complete the listed quests</li>
              <li>Claim rewards when available</li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}
