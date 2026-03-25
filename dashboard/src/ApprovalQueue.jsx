import React, { useState } from 'react'

function formatTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function ApprovalQueue({ approvals, onRefresh }) {
  const [processing, setProcessing] = useState(null)

  const handleAction = async (id, action) => {
    setProcessing(id)
    try {
      await fetch(`/api/approvals/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_id: id, reason: action === 'reject' ? 'Owner rejected' : '' }),
      })
      onRefresh()
    } catch (err) {
      console.error(`Failed to ${action}:`, err)
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Owner Approval Queue</h2>
        <button onClick={onRefresh} className="px-3 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 text-xs">
          Refresh
        </button>
      </div>

      {approvals.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">✓</div>
          <div className="text-gray-400 text-lg font-medium">All clear</div>
          <div className="text-gray-600 text-sm mt-1">No pending approvals</div>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map(approval => {
            const details = approval.result?.approval_details || {}
            return (
              <div
                key={approval.id}
                className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden hover:border-blue-500/30 transition-colors"
              >
                {/* Card header */}
                <div className="px-6 py-4 border-b border-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">
                        {approval.skill}
                      </span>
                      <h3 className="text-white font-semibold mt-1">
                        {approval.result?.approval_reason || 'Action requires approval'}
                      </h3>
                    </div>
                    <span className="text-xs text-gray-500">{formatTime(approval.timestamp)}</span>
                  </div>
                </div>

                {/* Details */}
                <div className="px-6 py-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {details.product && (
                      <div>
                        <div className="text-xs text-gray-500">Product</div>
                        <div className="text-sm text-white font-medium mt-1">{details.product}</div>
                      </div>
                    )}
                    {details.supplier && (
                      <div>
                        <div className="text-xs text-gray-500">Supplier</div>
                        <div className="text-sm text-white font-medium mt-1">{details.supplier}</div>
                      </div>
                    )}
                    {details.price_per_unit && (
                      <div>
                        <div className="text-xs text-gray-500">Price/Unit</div>
                        <div className="text-sm text-white font-medium mt-1">₹{details.price_per_unit}</div>
                      </div>
                    )}
                    {details.delivery_days && (
                      <div>
                        <div className="text-xs text-gray-500">Delivery</div>
                        <div className="text-sm text-white font-medium mt-1">{details.delivery_days} days</div>
                      </div>
                    )}
                    {details.min_order_qty && (
                      <div>
                        <div className="text-xs text-gray-500">Min Order</div>
                        <div className="text-sm text-white font-medium mt-1">{details.min_order_qty} units</div>
                      </div>
                    )}
                    {details.total_evaluated && (
                      <div>
                        <div className="text-xs text-gray-500">Evaluated</div>
                        <div className="text-sm text-white font-medium mt-1">{details.total_evaluated} suppliers</div>
                      </div>
                    )}
                  </div>

                  {details.reasoning && (
                    <div className="mt-4 px-4 py-3 rounded-lg bg-gray-950/50 border border-gray-800">
                      <div className="text-xs text-gray-500 mb-1">AI Reasoning</div>
                      <div className="text-sm text-gray-300">{details.reasoning}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-6 py-4 border-t border-gray-800 flex gap-3">
                  <button
                    onClick={() => handleAction(approval.id, 'approve')}
                    disabled={processing === approval.id}
                    className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    {processing === approval.id ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleAction(approval.id, 'reject')}
                    disabled={processing === approval.id}
                    className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ApprovalQueue
