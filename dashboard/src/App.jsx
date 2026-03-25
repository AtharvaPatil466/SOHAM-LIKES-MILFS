import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  CheckCircle2, 
  History, 
  Users, 
  Bell,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import HomeTab from './components/HomeTab';
import ApprovalsTab from './components/ApprovalsTab';
import WhatHappenedTab from './components/WhatHappenedTab';
import AgentsTab from './components/AgentsTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [logs, setLogs] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState({
    moneySaved: 8400,
    ordersPlaced: 6,
    offersSent: 147,
    hoursSaved: 12
  });
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    fetchData();
    connectWebSocket();
    const interval = setInterval(fetchData, 30000);
    return () => {
      clearInterval(interval);
      if (ws.current) ws.current.close();
    };
  }, []);

  const fetchData = async () => {
    try {
      const [statusRes, approvalsRes, logsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/approvals'),
        fetch('/api/audit?limit=100')
      ]);
      
      const statusData = await statusRes.json();
      const approvalsData = await approvalsRes.json();
      const logsData = await logsRes.json();

      setAgents(statusData.skills || []);
      setApprovals(approvalsData || []);
      setLogs(logsData || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    ws.current = new WebSocket(`${protocol}//${host}/ws/events`);

    ws.current.onopen = () => setIsConnected(true);
    ws.current.onclose = () => {
      setIsConnected(false);
      setTimeout(connectWebSocket, 3000);
    };
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'audit_log') {
        setLogs(prev => [message.data, ...prev].slice(0, 100));
        // Refresh approvals if something changed
        if (['owner_approved', 'owner_rejected', 'approval_requested'].includes(message.data.event_type)) {
          fetchData();
        }
      }
    };
  };

  const tabs = [
    { id: 'home', label: 'HOME', icon: LayoutDashboard },
    { id: 'approvals', label: 'APPROVALS', icon: CheckCircle2, badge: approvals.length },
    { id: 'history', label: 'WHAT HAPPENED', icon: History },
    { id: 'agents', label: 'MY AGENTS', icon: Users },
  ];

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-black text-white relative">
      {/* Header / Tabs */}
      <nav className="sticky top-0 z-50 bg-[#0f0f0f]/80 backdrop-blur-md border-b border-white/5 px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-black tracking-tighter italic">RetailOS</h1>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1.5 pb-2 transition-all relative ${
                activeTab === tab.id ? 'text-primary' : 'text-white/40 hover:text-white/60'
              }`}
            >
              <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
              <span className="text-[10px] font-black tracking-wider uppercase">
                {tab.label}
              </span>
              {tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTab" 
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" 
                />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 pb-24 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {activeTab === 'home' && (
              <HomeTab 
                stats={stats} 
                logs={logs} 
                approvalCount={approvals.length}
                onGoToApprovals={() => setActiveTab('approvals')}
              />
            )}
            {activeTab === 'approvals' && (
              <ApprovalsTab 
                approvals={approvals} 
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'history' && (
              <WhatHappenedTab 
                logs={logs} 
              />
            )}
            {activeTab === 'agents' && (
              <AgentsTab 
                agents={agents} 
                onRefresh={fetchData}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
