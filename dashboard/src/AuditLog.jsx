import React, { useState } from 'react'

const STATUS_COLORS = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  alert: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pending: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  pending_approval: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  escalated: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  skipped: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  rerouted: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
}

const SKILL_COLORS = {
  orchestrator: 'text-blue-400',
  inventory: 'text-cyan-400',
  procurement: 'text-violet-400',
  negotiation: 'text-amber-400',
  customer: 'text-pink-400',
  analytics: 'text-emerald-400',
}

function formatTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function AuditLog({ logs, onRefresh }) {
  const [expandedId, setExpandedId] = useState(null)
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? logs : logs.filter(l => l.skill === filter)
  const uniqueSkills = [...new Set(logs.map(l => l.skill))]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Audit Trail</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filter === 'all' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              All
            </button>
            {uniqueSkills.map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  filter === s ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button onClick={onRefresh} className="px-3 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 text-xs">
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No audit log entries yet. Trigger a demo flow to get started.
          </div>
        ) : (
          filtered.map(log => (
            <div
              key={log.id}
              className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-700 transition-colors cursor-pointer"
              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
            >
              {/* Summary row */}
              <div className="px-4 py-3 flex items-start gap-4">
                <div className="text-xs text-gray-500 font-mono w-20 shrink-0 pt-0.5">
                  {formatTime(log.timestamp)}
                </div>
                <div className={`text-xs font-medium w-24 shrink-0 pt-0.5 ${SKILL_COLORS[log.skill] || 'text-gray-400'}`}>
                  {log.skill}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200">{log.decision}</div>
                  {log.reasoning && (
                    <div className="text-xs text-gray-500 mt-1 truncate">{log.reasoning}</div>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs border shrink-0 ${STATUS_COLORS[log.status] || STATUS_COLORS.success}`}>
                  {log.status}
                </span>
              </div>

              {/* Expanded detail */}
              {expandedId === log.id && (
                <div className="px-4 py-3 border-t border-gray-800 bg-gray-950/50">
                  <div className="grid grid-cols-1 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Event Type</div>
                      <div className="text-gray-300 font-mono text-xs">{log.event_type}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Reasoning</div>
                      <div className="text-gray-300 text-xs whitespace-pre-wrap">{log.reasoning}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Outcome</div>
                      <div className="text-gray-300 text-xs whitespace-pre-wrap font-mono bg-gray-900 rounded p-2 overflow-x-auto">
                        {tryFormatJSON(log.outcome)}
                      </div>
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Metadata</div>
                        <div className="text-gray-300 text-xs whitespace-pre-wrap font-mono bg-gray-900 rounded p-2 overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function tryFormatJSON(str) {
  try {
    const parsed = JSON.parse(str)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return str
  }
}

export default AuditLog
