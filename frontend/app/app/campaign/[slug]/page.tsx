"use client"

import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/growstreams-api'
import { useAccount } from '@gear-js/react-hooks'
import {
  Sprout, CheckCircle2, Loader2, ArrowRight, Clock,
  ExternalLink, Twitter, Star, GitPullRequest, Waves, Gift, Megaphone,
} from 'lucide-react'

// ─── Icon map (mirrors quests page) ─────────────────────────────────────────
const QUEST_ICONS: Record<string, React.ElementType> = {
  twitter: Twitter, megaphone: Megaphone, star: Star,
  'git-pull-request': GitPullRequest, waves: Waves, gift: Gift,
}
function QuestIcon({ icon }: { icon: string }) {
  const Icon = QUEST_ICONS[icon] || Sprout
  return <Icon className="w-5 h-5" />
}

function XpBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400">
      <Sprout className="w-3 h-3" />{amount} XP
    </span>
  )
}

// ─── Quest Card (same style as /app/quests) ──────────────────────────────────
function CampaignQuestCard({ quest, wallet, onClaim, claiming }: {
  quest: any; wallet: string;
  onClaim: (slug: string, payload?: Record<string, string>) => void;
  claiming: boolean;
}) {
  const isCompleted = quest.completed
  const isPending   = !!quest.pendingSubmission
  const isRejected  = !!quest.rejectedSubmission
  const isFollowX      = quest.quest_type === 'X_FOLLOW'
  const isMentionX     = quest.quest_type === 'X_MENTION'
  const isRetweet      = quest.quest_type === 'X_RETWEET'
  const isTweetKeyword = quest.quest_type === 'X_TWEET_KEYWORD'
  const needsManualInput = isFollowX || isMentionX || isRetweet || isTweetKeyword
  const needsTweetUrl    = isMentionX || isRetweet || isTweetKeyword

  const questMeta      = (quest.meta || {}) as Record<string, unknown>
  const inputLabel     = (questMeta.input_label as string)      || (isFollowX ? 'Your X username' : 'Tweet URL')
  const inputPlaceholder = (questMeta.input_placeholder as string) || (isFollowX ? '@yourhandle' : 'https://x.com/yourhandle/status/...')
  const externalUrl    = (questMeta.url || questMeta.invite_url || questMeta.original_tweet_url) as string | undefined

  const [xUsername, setXUsername] = useState('')
  const [tweetUrl, setTweetUrl]   = useState('')
  const inputValue = isFollowX ? xUsername : tweetUrl
  const inputValid = needsManualInput
    ? (isFollowX ? xUsername.trim().length > 0 : /^https?:\/\/(x\.com|twitter\.com)\//i.test(tweetUrl.trim()))
    : true

  const handleClaim = () => {
    if (isFollowX)        onClaim(quest.slug, { x_username: xUsername.trim().replace(/^@/, '') })
    else if (needsTweetUrl) onClaim(quest.slug, { tweet_url: tweetUrl.trim() })
    else                  onClaim(quest.slug)
  }

  const statusBadge = () => {
    if (isCompleted) return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Done</span>
    if (isPending)   return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400"><Clock className="w-3 h-3" /> Under review</span>
    if (isRejected)  return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400">Rejected — resubmit</span>
    return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-provn-border/40 text-provn-muted"><Clock className="w-3 h-3" /> Pending</span>
  }

  return (
    <div className={`relative bg-provn-surface border rounded-xl p-5 transition-all ${
      isCompleted ? 'border-emerald-500/30 bg-emerald-500/5'
      : isPending  ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-provn-border hover:border-provn-muted/30'
    }`}>
      <div className="absolute top-3 right-3">{statusBadge()}</div>

      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-emerald-500/15 text-emerald-400' : 'bg-provn-bg text-provn-muted'}`}>
          <QuestIcon icon={quest.icon} />
        </div>
        <div className="min-w-0 pr-20">
          <h3 className="font-semibold text-sm">{quest.title}</h3>
          <p className="text-xs text-provn-muted mt-0.5">{quest.description}</p>
          {externalUrl && !isCompleted && (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-400 hover:text-emerald-300">
              <ExternalLink className="w-3 h-3" /> Open link
            </a>
          )}
        </div>
      </div>

      {needsManualInput && !isCompleted && !isPending && (
        <div className="mb-3 space-y-1.5">
          {isMentionX && (
            <p className="text-[11px] text-provn-muted">
              Tweet must mention <span className="text-emerald-400">{(questMeta.required_mention as string) || '@GrowStreams'}</span> + include your wallet:{' '}
              <code className="text-emerald-400 text-[10px]">{wallet.slice(0,10)}…{wallet.slice(-6)}</code>
            </p>
          )}
          {isRetweet && (
            <p className="text-[11px] text-provn-muted">
              Retweet{questMeta.original_tweet_url ? <> <a href={questMeta.original_tweet_url as string} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">this post</a>,</> : ' the campaign post,'} then paste the URL of your retweet below.
            </p>
          )}
          {isTweetKeyword && (
            <p className="text-[11px] text-provn-muted">
              Tweet must mention <span className="text-emerald-400">{(questMeta.required_mention as string) || '@GrowStreams'}</span>
              {(questMeta.required_keyword as string) && <> and include <span className="text-emerald-400 font-mono">&quot;{String(questMeta.required_keyword)}&quot;</span></>}.
            </p>
          )}
          <label className="text-[11px] font-medium text-provn-muted">{inputLabel}</label>
          <input type="text" value={inputValue}
            onChange={e => isFollowX ? setXUsername(e.target.value) : setTweetUrl(e.target.value)}
            placeholder={inputPlaceholder}
            className="w-full px-3 py-2 bg-provn-bg border border-provn-border rounded-lg text-xs focus:border-emerald-500/50 focus:outline-none" />
          {isRejected && (quest.rejectedSubmission?.proof as any)?.reject_reason && (
            <p className="text-[11px] text-red-400">Rejected: {(quest.rejectedSubmission.proof as any).reject_reason}</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-provn-border/50">
        <div className="flex items-center gap-2">
          <XpBadge amount={quest.seeds_reward} />
          {isCompleted && quest.totalEarned && (
            <span className="text-[11px] text-emerald-400">+{quest.totalEarned} Seeds earned</span>
          )}
        </div>
        {!isCompleted && !isPending && (
          <button onClick={handleClaim} disabled={claiming || (needsManualInput && !inputValid)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {claiming ? <><Loader2 className="w-3 h-3 animate-spin" /> Submitting</> : needsManualInput ? <>Submit <ArrowRight className="w-3 h-3" /></> : <>Claim <ArrowRight className="w-3 h-3" /></>}
          </button>
        )}
        {isPending && <span className="text-xs text-amber-400">Awaiting review</span>}
        {isCompleted && <span className="text-xs text-emerald-400">✓ Completed</span>}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const params = useParams() as { slug?: string }
  const { account } = useAccount()
  const wallet = account?.decodedAddress || ''

  const [campaign, setCampaign]   = useState<any | null>(null)
  const [quests,   setQuests]     = useState<any[]>([])
  const [loading,  setLoading]    = useState(true)
  const [claiming, setClaiming]   = useState<string | null>(null)
  const [claimMsg, setClaimMsg]   = useState('')
  const [registered, setRegistered] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    if (!params.slug) return
    setLoading(true)
    try {
      const res = await api.quests.questCampaign(params.slug) as any
      // API returns flat object: { id, slug, title, quests: [...], ... }
      const { quests: rawQuests, ...campaignData } = res || {}
      setCampaign(campaignData?.slug ? campaignData : null)

      // Merge completion status from /me if wallet is connected
      let userQuests: any[] = rawQuests || []
      if (wallet) {
        try {
          const me = await api.quests.me(wallet) as any
          setRegistered(!!me?.registered)
          const meMap: Record<string, any> = {}
          ;(me?.quests || []).forEach((q: any) => { meMap[q.slug] = q })
          userQuests = userQuests.map((q: any) => ({ ...q, ...(meMap[q.slug] || {}) }))
        } catch { setRegistered(false) }
      } else {
        setRegistered(null)
      }
      setQuests(userQuests)
    } catch {
      setCampaign(null)
    } finally {
      setLoading(false)
    }
  }, [params.slug, wallet])

  useEffect(() => { load() }, [load])

  const handleClaim = async (questSlug: string, payload?: Record<string, string>) => {
    if (!wallet) return
    setClaiming(questSlug); setClaimMsg('')
    try {
      // claim(slug, wallet, payload) — slug is first arg
      const result = await api.quests.claim(questSlug, wallet, payload as any) as any
      if (result?.status === 'VERIFIED') {
        setClaimMsg('✅ Quest verified! XP awarded.')
      } else {
        setClaimMsg('📝 Submitted for review!')
      }
      setTimeout(() => { load(); setClaimMsg('') }, 1800)
    } catch (err: any) {
      setClaimMsg(err?.message || 'Failed to submit')
      setClaiming(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-60">
      <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
    </div>
  )
  if (!campaign) return <div className="text-center text-provn-muted py-20">Campaign not found</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Banner */}
      <div className="rounded-2xl overflow-hidden border border-provn-border bg-provn-surface">
        {campaign.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.banner_url} alt={campaign.title} className="w-full h-52 object-cover" />
        ) : (
          <div className="w-full h-52 bg-gradient-to-br from-emerald-900/30 to-provn-bg flex items-center justify-center">
            <Sprout className="w-16 h-16 text-emerald-700/40" />
          </div>
        )}
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-700 text-emerald-300 font-semibold">{campaign.status || 'ACTIVE'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-provn-border/40 text-provn-muted">CAMPAIGN</span>
                {campaign.partner && <span className="text-[10px] px-2 py-0.5 rounded-full bg-provn-border/40 text-provn-muted">by {campaign.partner}</span>}
              </div>
              <h1 className="text-2xl font-bold">{campaign.title}</h1>
              {campaign.reward_summary && (
                <p className="text-sm font-semibold text-emerald-400 mt-1">{campaign.reward_summary}</p>
              )}
              <p className="text-sm text-provn-muted mt-2 max-w-xl">{campaign.description}</p>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-2xl font-bold text-emerald-400">{quests.reduce((s: number, q: any) => s + (q.seeds_reward || 0), 0)} XP</div>
              <div className="text-xs text-provn-muted">total available</div>
              <div className="mt-1 text-xs text-provn-muted">{quests.filter((q: any) => q.completed).length}/{quests.length} done</div>
            </div>
          </div>
        </div>
      </div>

      {/* On-chain note */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/5 border border-emerald-500/15 rounded-lg text-xs text-provn-muted">
        <Sprout className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        XP is minted on-chain via VARA Network. Every approved quest creates a blockchain transaction.
      </div>

      {/* Registration gate */}
      {wallet && registered === false && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">You need to register for quests before you can claim XP.</p>
          <a href="/app/quests" className="flex-shrink-0 px-4 py-1.5 rounded-full bg-emerald-500 text-black text-xs font-semibold hover:bg-emerald-400 transition-colors">
            Register now
          </a>
        </div>
      )}
      {!wallet && (
        <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
          Connect your wallet to track progress and claim quests.
        </div>
      )}

      {claimMsg && (
        <div className={`px-4 py-2.5 rounded-lg text-sm ${
          claimMsg.startsWith('✅') || claimMsg.startsWith('📝')
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {claimMsg}
        </div>
      )}

      {/* Quest grid */}
      {quests.length === 0 ? (
        <div className="text-center text-provn-muted py-16 bg-provn-surface border border-provn-border rounded-xl">
          No quests added to this project yet.
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Sprout className="w-5 h-5 text-emerald-400" /> Quests
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quests.map((q: any) => (
              <CampaignQuestCard
                key={q.slug}
                quest={q}
                wallet={wallet}
                onClaim={handleClaim}
                claiming={claiming === q.slug}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
