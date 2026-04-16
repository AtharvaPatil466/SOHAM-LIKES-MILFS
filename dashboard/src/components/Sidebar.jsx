import React from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  CheckCircle2,
  History,
  Users,
  Zap,
  Wifi,
  WifiOff,
  Package,
  FolderKanban,
  Briefcase,
  ShoppingCart,
  Truck,
  UserCircle2,
  Receipt,
  IndianRupee,
  LayoutGrid,
  Bike,
  MessageSquare,
  Award,
  CreditCard,
  ClipboardList,
  ScanLine,
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, approvalCount, isConnected }) {
  const navItems = [
    { id: 'home', label: 'Overview', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: UserCircle2 },
    { id: 'orders', label: 'Orders', icon: Receipt },
    { id: 'financials', label: 'Financials', icon: IndianRupee },
    { id: 'assistant', label: 'Customer Bot', icon: MessageSquare },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'cart', label: 'Cart', icon: ShoppingCart },
    { id: 'shelves', label: 'Shelves', icon: LayoutGrid },
    { id: 'delivery', label: 'Delivery', icon: Bike },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
    { id: 'staff', label: 'Staff', icon: ClipboardList },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'loyalty', label: 'Loyalty', icon: Award },
    { id: 'scanner', label: 'Scanner', icon: ScanLine },
    { id: 'approvals', label: 'Approvals', icon: CheckCircle2, badge: approvalCount },
    { id: 'history', label: 'Activity', icon: History },
    { id: 'agents', label: 'Agents', icon: Users },
  ];

  return (
    <aside className="hidden">
      <div className="rounded-[28px] border border-[var(--outline)] bg-[rgba(240,235,227,0.58)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface-high)] text-[var(--text)] shadow-lg shadow-black/10">
            <Zap size={18} className="text-[var(--text)]" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">RetailOS</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ink-muted)]">Navigation</p>
          </div>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all relative group ${
                activeTab === item.id 
                  ? 'bg-[var(--paper)] text-[var(--primary-ink)] shadow-lg shadow-black/10' 
                  : 'text-[#6b6560] hover:text-[var(--ink)] hover:bg-black/[0.04]'
              }`}
            >
              {activeTab === item.id && (
                <motion.div
                  layoutId="sidebarActive"
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-1 rounded-r-full bg-[var(--accent)]"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <item.icon size={18} strokeWidth={activeTab === item.id ? 2.5 : 2} />
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[var(--paper)] text-[10px] font-bold text-[var(--primary-ink)]">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-black/[0.03] px-4 py-3">
            {isConnected ? (
              <>
                <div className="relative">
                  <Wifi size={14} className="text-[var(--live)]" />
                  <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--live)] opacity-50 animate-ping" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[var(--primary-ink)]">Connected</div>
                  <div className="text-[10px] text-[var(--ink-muted)]">Real-time updates active</div>
                </div>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-[var(--danger)]" />
                <div>
                  <div className="text-xs font-bold text-[var(--primary-ink)]">Disconnected</div>
                  <div className="text-[10px] text-[var(--ink-muted)]">Reconnecting...</div>
                </div>
              </>
            )}
          </div>
          <div className="text-center">
            <span className="text-[10px] font-bold tracking-[0.18em] text-[var(--ink-muted)]">v1.0.0 · RetailOS</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
