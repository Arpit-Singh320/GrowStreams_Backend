'use client';

import { Medal, Crown, PartyPopper } from 'lucide-react';

export default function LeaderboardPage() {
  const winners = [
    { rank: 1, name: '@anmolsinha21', points: 16, prize: 50 },
    { rank: 2, name: '@Goofywater_06', points: 15, prize: 30 },
    { rank: 3, name: '@Abastrump', points: 14, prize: 20 },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Campaign Ended Banner */}
      <div className="bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-blue-500/20 border-2 border-amber-500/30 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <PartyPopper className="w-8 h-8 text-amber-400 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-amber-400 mb-2 flex items-center gap-2">
              VarAIbot Challenge Complete! 🎉
            </h2>
            <p className="text-provn-text mb-4">
              Big thanks to everyone who participated in the VarAIbot Challenge by GrowStreams 🙌
              The videos and PR shared by the community were incredibly valuable and played a key role in improving the project.
            </p>
            <p className="text-sm text-provn-muted">
              There will be no VarAIbot challenge this week, as we&apos;re preparing new activities for next week. Have a great start to the week 🚀
            </p>
          </div>
        </div>
      </div>

      {/* Winners Podium */}
      <div className="bg-provn-surface border border-provn-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-provn-border bg-gradient-to-r from-amber-500/5 to-transparent">
          <h3 className="font-bold flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            🏆 Campaign Winners
          </h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {winners.map((winner) => (
              <div
                key={winner.rank}
                className={`relative rounded-xl p-5 border-2 ${
                  winner.rank === 1
                    ? 'bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/30'
                    : winner.rank === 2
                    ? 'bg-gradient-to-br from-gray-400/10 to-gray-500/5 border-gray-400/30'
                    : 'bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/30'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    winner.rank === 1 ? 'bg-amber-500/20' :
                    winner.rank === 2 ? 'bg-gray-400/20' : 'bg-orange-500/20'
                  }`}>
                    <Medal className={`w-6 h-6 ${
                      winner.rank === 1 ? 'text-amber-400' :
                      winner.rank === 2 ? 'text-gray-300' : 'text-orange-400'
                    }`} />
                  </div>
                  <div>
                    <p className="text-xs text-provn-muted uppercase tracking-wider">{winner.rank === 1 ? '1st' : winner.rank === 2 ? '2nd' : '3rd'} Place</p>
                    <p className="font-bold text-lg">{winner.name}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-provn-muted">Points</span>
                    <span className="font-bold text-amber-400">{winner.points}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-provn-muted">Prize</span>
                    <span className="font-bold text-emerald-400">${winner.prize} USDC</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
