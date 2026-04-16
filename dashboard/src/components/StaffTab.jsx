import React, { useEffect, useMemo, useState } from 'react';
import { Users, Clock3, ShieldCheck, AlertTriangle } from 'lucide-react';

const getApiBase = () => (typeof window !== 'undefined' ? window.location.origin : '');
const getToken = () => {
  try {
    return localStorage.getItem('retailos_token') || localStorage.getItem('token') || '';
  } catch {
    return '';
  }
};

function StatCard({ label, value, helper, icon: Icon, toneClass }) {
  return (
    <div className="atelier-paper-soft rounded-[24px] p-5">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon size={18} />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ink-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black tracking-tight text-[var(--ink)]">{value}</div>
      <div className="mt-2 text-xs font-semibold text-[var(--ink-muted)]">{helper}</div>
    </div>
  );
}

export default function StaffTab() {
  const api = getApiBase();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${api}/api/v2/staff`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((data) => setStaff(data.staff || []))
      .catch(() => setStaff([]))
      .finally(() => setLoading(false));
  }, [api]);

  const stats = useMemo(() => ({
    total: staff.length,
    active: staff.filter((member) => member.is_active).length,
    onShift: staff.filter((member) => member.current_shift).length,
  }), [staff]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[rgba(215,193,194,0.28)] border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total Staff" value={stats.total} helper="Everyone registered in the store roster" icon={Users} toneClass="bg-[var(--accent-soft)] text-[var(--accent)]" />
        <StatCard label="Active" value={stats.active} helper="Team members currently enabled for operations" icon={ShieldCheck} toneClass="bg-[rgba(215,193,194,0.18)] text-[var(--primary-ink)]" />
        <StatCard label="On Shift" value={stats.onShift} helper="Staff marked as currently working" icon={Clock3} toneClass="bg-[var(--warning-soft)] text-[var(--primary-ink)]" />
      </div>

      <div className="atelier-paper-strong overflow-hidden rounded-[28px]">
        <div className="border-b border-black/5 px-6 py-5">
          <div className="atelier-label text-[10px] text-[var(--ink-muted)]">Staff Management</div>
          <h2 className="mt-2 font-display text-2xl font-bold text-[var(--ink)]">Store team roster</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[rgba(215,193,194,0.16)] text-[var(--ink-muted)]">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]">Name</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]">Role</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]">Phone</th>
                <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em]">Status</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member, index) => (
                <tr key={index} className="border-t border-black/5">
                  <td className="px-6 py-4 font-semibold text-[var(--ink)]">{member.name || member.full_name}</td>
                  <td className="px-6 py-4 text-[var(--ink-muted)]">{member.role}</td>
                  <td className="px-6 py-4 text-[var(--ink-muted)]">{member.phone || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${member.is_active ? 'bg-[var(--accent-soft)] text-[var(--primary-ink)]' : 'bg-[var(--danger-soft)] text-[var(--primary-ink)]'}`}>
                      {member.is_active ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
                      {member.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-[var(--ink-muted)]">
                    No staff members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
