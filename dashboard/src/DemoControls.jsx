import React, { useState } from 'react'

function DemoControls({ negotiations, onRefresh }) {
  const [loading, setLoading] = useState({})
  const [replyText, setReplyText] = useState('')
  const [replyNegId, setReplyNegId] = useState('')
  const [result, setResult] = useState(null)

  const handleAction = async (action, endpoint, body = {}) => {
    setLoading(l => ({ ...l, [action]: true }))
    setResult(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setResult({ action, data })
      onRefresh()
    } catch (err) {
      setResult({ action, error: err.message })
    } finally {
      setLoading(l => ({ ...l, [action]: false }))
    }
  }

  const activeNegs = Object.entries(negotiations.active || {})
  const messageLog = negotiations.message_log || []

  const malformedExamples = [
    'haa bhai denge, 50 box minimum, price thoda negotiate hoga',
    'ok bhai, ₹220 per unit de denge. delivery 3-4 din lagega. 50 minimum order rakhna padega.',
    'abhi stock nahi hai, next week check karo',
    'haan haan, 200 rupay lagega ek piece ka. 100 box minimum. COD chalega?',
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Demo Controls</h2>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => handleAction('flow', '/api/demo/trigger-flow')}
          disabled={loading.flow}
          className="p-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors disabled:opacity-50"
        >
          {loading.flow ? 'Triggering...' : 'Trigger Ice Cream Flow'}
          <div className="text-xs font-normal opacity-75 mt-1">
            Drops stock → Inventory alert → Procurement → Negotiation
          </div>
        </button>

        <button
          onClick={() => handleAction('check', '/api/inventory/check')}
          disabled={loading.check}
          className="p-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-semibold transition-colors disabled:opacity-50"
        >
          {loading.check ? 'Checking...' : 'Run Inventory Check'}
          <div className="text-xs font-normal opacity-75 mt-1">
            Full scan of all SKUs
          </div>
        </button>

        <button
          onClick={() => handleAction('analytics', '/api/analytics/run')}
          disabled={loading.analytics}
          className="p-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-semibold transition-colors disabled:opacity-50"
        >
          {loading.analytics ? 'Running...' : 'Run Analytics'}
          <div className="text-xs font-normal opacity-75 mt-1">
            Daily pattern analysis
          </div>
        </button>
      </div>

      {/* Simulate Supplier Reply */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
        <h3 className="text-white font-semibold mb-3">Simulate Supplier Reply</h3>
        <p className="text-xs text-gray-500 mb-4">
          Send a mock WhatsApp reply from a supplier. Try a messy Hinglish message to see Gemini parse it.
        </p>

        {/* Quick fill buttons */}
        <div className="flex flex-wrap gap-2 mb-3">
          {malformedExamples.map((ex, i) => (
            <button
              key={i}
              onClick={() => setReplyText(ex)}
              className="px-3 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
            >
              Example {i + 1}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Negotiation ID (e.g., neg_SKU-001_SUP-001_...)"
            value={replyNegId}
            onChange={e => setReplyNegId(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-gray-950 border border-gray-700 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <textarea
            placeholder="Supplier reply message (try Hinglish!)..."
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 rounded-lg bg-gray-950 border border-gray-700 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
          />
          <button
            onClick={() => handleAction('reply', '/api/demo/supplier-reply', {
              negotiation_id: replyNegId || 'demo_neg',
              supplier_id: 'SUP-001',
              supplier_name: 'FreshFreeze Distributors',
              message: replyText,
              product_name: 'Amul Vanilla Ice Cream',
            })}
            disabled={!replyText || loading.reply}
            className="px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {loading.reply ? 'Sending...' : 'Send Supplier Reply'}
          </button>
        </div>
      </div>

      {/* Active Negotiations */}
      {activeNegs.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h3 className="text-white font-semibold mb-3">Active Negotiations</h3>
          <div className="space-y-3">
            {activeNegs.map(([id, neg]) => (
              <div key={id} className="px-4 py-3 rounded-lg bg-gray-950 border border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white font-medium">{neg.product_name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    neg.status === 'awaiting_reply' ? 'bg-amber-500/10 text-amber-400' :
                    neg.status === 'deal_ready' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-blue-500/10 text-blue-400'
                  }`}>
                    {neg.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Supplier: {neg.supplier_name} | ID: {id}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp Message Log */}
      {messageLog.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h3 className="text-white font-semibold mb-3">WhatsApp Thread</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
            {messageLog.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  msg.direction === 'outbound'
                    ? 'bg-blue-600/20 border border-blue-500/20'
                    : 'bg-gray-800 border border-gray-700'
                }`}>
                  <div className="text-xs text-gray-500 mb-1">
                    {msg.direction === 'outbound' ? 'RetailOS' : msg.supplier_name}
                    {msg.type === 'clarification' && ' (clarification)'}
                  </div>
                  <div className="text-sm text-gray-200">{msg.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last result */}
      {result && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h3 className="text-white font-semibold mb-2">Last Action Result</h3>
          <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto bg-gray-950 rounded p-3">
            {JSON.stringify(result.data || result.error, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default DemoControls
