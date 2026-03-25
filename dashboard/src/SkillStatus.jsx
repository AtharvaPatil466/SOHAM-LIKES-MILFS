import React from 'react'

const STATE_CONFIG = {
  running: { label: 'Running', dot: 'bg-emerald-400 animate-pulse', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  paused: { label: 'Paused', dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  error: { label: 'Error', dot: 'bg-red-400 animate-pulse', badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
  initializing: { label: 'Starting', dot: 'bg-blue-400 animate-pulse', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  stopped: { label: 'Stopped', dot: 'bg-gray-400', badge: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
}

const SKILL_DESCRIPTIONS = {
  inventory: 'Monitors stock levels, calculates days until stockout',
  procurement: 'Ranks suppliers using price, reliability, and history',
  negotiation: 'WhatsApp outreach to suppliers, parses messy replies',
  customer: 'Segments customers, sends personalized offers',
  analytics: 'Daily pattern analysis on audit logs and purchases',
}

function SkillStatus({ skills, onRefresh }) {
  const handleToggle = async (name, currentState) => {
    const action = currentState === 'paused' ? 'resume' : 'pause'
    try {
      await fetch(`/api/skills/${name}/${action}`, { method: 'POST' })
      onRefresh()
    } catch (err) {
      console.error(`Failed to ${action} skill:`, err)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Skill Status</h2>
        <button onClick={onRefresh} className="px-3 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 text-xs">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map(skill => {
          const config = STATE_CONFIG[skill.state] || STATE_CONFIG.stopped
          return (
            <div
              key={skill.name}
              className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
                  <h3 className="text-white font-semibold capitalize">{skill.name}</h3>
                </div>
                <button
                  onClick={() => handleToggle(skill.name, skill.state)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    skill.state === 'paused'
                      ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  }`}
                >
                  {skill.state === 'paused' ? 'Resume' : 'Pause'}
                </button>
              </div>

              <p className="text-xs text-gray-500 mb-4">
                {SKILL_DESCRIPTIONS[skill.name] || 'No description'}
              </p>

              <div className="flex items-center justify-between text-xs">
                <span className={`px-2 py-0.5 rounded border ${config.badge}`}>
                  {config.label}
                </span>
                <span className="text-gray-500">
                  {skill.run_count} runs
                </span>
              </div>

              {skill.last_error && (
                <div className="mt-3 px-3 py-2 rounded bg-red-500/5 border border-red-500/10">
                  <div className="text-xs text-red-400 truncate">{skill.last_error}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {skills.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No skills loaded. Start the runtime to see skill status.
        </div>
      )}
    </div>
  )
}

export default SkillStatus
