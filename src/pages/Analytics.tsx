import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CheckInRecord, UserProfile } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { TrendingUp, Users, Clock, Calendar, Download, Filter } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Analytics() {
  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<7 | 30>(7);
  const [selectedDept, setSelectedDept] = useState<string>('all');

  useEffect(() => {
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const checkinsUnsubscribe = onSnapshot(collection(db, 'checkins'), (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CheckInRecord)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'checkins'));

    return () => {
      usersUnsubscribe();
      checkinsUnsubscribe();
    };
  }, []);

  const departments = useMemo(() => {
    const depts = new Set(users.map(u => u.department).filter(Boolean));
    return Array.from(depts) as string[];
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (selectedDept === 'all') return users;
    return users.filter(u => u.department === selectedDept);
  }, [users, selectedDept]);

  const filteredRecords = useMemo(() => {
    if (selectedDept === 'all') return records;
    const deptUserIds = new Set(filteredUsers.map(u => u.uid));
    return records.filter(r => deptUserIds.has(r.userId));
  }, [records, filteredUsers, selectedDept]);

  // Process data for charts
  const chartData = Array.from({ length: timeRange }, (_, i) => {
    const date = subDays(new Date(), (timeRange - 1) - i);
    const dayStart = startOfDay(date);
    const dayRecords = filteredRecords.filter(r => 
      r.timestamp.toDate() >= dayStart && 
      r.timestamp.toDate() < startOfDay(subDays(date, -1))
    );
    
    return {
      name: timeRange === 7 
        ? format(date, 'EEE', { locale: fr })
        : format(date, 'dd/MM'),
      heures: (() => {
        let dayHours = 0;
        const dayOuts = dayRecords.filter(r => r.type === 'check-out');
        dayOuts.forEach(out => {
          const matchingIn = filteredRecords.find(r => r.id === out.sessionId);
          if (matchingIn) {
            dayHours += (out.timestamp.toMillis() - matchingIn.timestamp.toMillis()) / (1000 * 60 * 60);
          }
        });
        return Math.round(dayHours * 10) / 10;
      })(),
      presences: dayRecords.filter(r => r.type === 'check-in').length
    };
  });

  const roleDistribution = [
    { name: 'Workers', value: filteredUsers.filter(u => u.role === 'worker').length },
    { name: 'Managers', value: filteredUsers.filter(u => u.role === 'superviseur').length },
    { name: 'Admins', value: filteredUsers.filter(u => u.role === 'admin_rh' || u.role === 'super_admin').length },
  ];

  const totalHoursMonth = (() => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    let total = 0;
    const monthOuts = filteredRecords.filter(r => r.type === 'check-out' && r.timestamp.toDate() >= startOfMonth);
    monthOuts.forEach(out => {
      const matchingIn = filteredRecords.find(r => r.id === out.sessionId);
      if (matchingIn) {
        total += (out.timestamp.toMillis() - matchingIn.timestamp.toMillis()) / (1000 * 60 * 60);
      }
    });
    return Math.round(total);
  })();

  const COLORS = ['#20426B', '#6366F1', '#F59E0B', '#EF4444'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b border-[var(--color-border)] pb-8">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Analytics</h1>
          <p className="text-slate-500 text-lg">Visualisez les performances et tendances de présence.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-2 bg-white border border-[var(--color-border)] rounded-md px-3 py-2 shadow-sm">
            <Filter size={16} className="text-slate-400" />
            <select 
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-900 focus:outline-none"
            >
              <option value="all">Tous les départements</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          <button className="bg-brand hover:bg-brand/90 text-slate-900 px-5 py-2.5 rounded-md font-bold shadow-sm transition-all flex items-center justify-center gap-2 text-sm">
            <Download size={18} />
            Exporter Rapport
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[var(--color-bg-sidebar)] border border-[var(--color-border)] p-6 rounded-lg shadow-sm group hover:border-brand/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-brand/10 rounded-md flex items-center justify-center text-brand">
              <Users size={20} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total Staff</span>
          </div>
          <p className="text-3xl font-bold text-slate-900 tabular-nums">{filteredUsers.length}</p>
          <div className="mt-4 flex items-center gap-2">
            <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand w-full opacity-50"></div>
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-bg-sidebar)] border border-[var(--color-border)] p-6 rounded-lg shadow-sm group hover:border-brand/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-md flex items-center justify-center text-indigo-400">
              <Clock size={20} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Heures (Mois)</span>
          </div>
          <p className="text-3xl font-bold text-slate-900 tabular-nums">{totalHoursMonth}h</p>
          <div className="mt-4 flex items-center gap-2">
            <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 w-3/4 opacity-50"></div>
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-bg-sidebar)] border border-[var(--color-border)] p-6 rounded-lg shadow-sm group hover:border-brand/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-amber-500/10 rounded-md flex items-center justify-center text-amber-400">
              <Calendar size={20} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ponctualité</span>
          </div>
          <p className="text-3xl font-bold text-slate-900 tabular-nums">98%</p>
          <div className="mt-4 flex items-center gap-2">
            <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 w-[98%] opacity-50"></div>
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-bg-sidebar)] border border-[var(--color-border)] p-6 rounded-lg shadow-sm group hover:border-brand/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-brand/10 rounded-md flex items-center justify-center text-brand">
              <TrendingUp size={20} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sessions Live</span>
          </div>
          <p className="text-3xl font-bold text-slate-900 tabular-nums">
            {(() => {
              const userLastRecord: Record<string, CheckInRecord> = {};
              filteredRecords.forEach(record => {
                if (!userLastRecord[record.userId]) {
                  userLastRecord[record.userId] = record;
                }
              });
              return Object.values(userLastRecord).filter(r => r.type === 'check-in').length;
            })()}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand w-1/2 opacity-50 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Bar Chart */}
        <div className="lg:col-span-2 bg-[var(--color-bg-sidebar)] border border-[var(--color-border)] p-8 rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Présences Quotidiennes</h3>
              <p className="text-sm text-slate-500">Statistiques sur les {timeRange} derniers jours</p>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-md border border-[var(--color-border)]">
              <button 
                onClick={() => setTimeRange(7)}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase rounded transition-all",
                  timeRange === 7 ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-900"
                )}
              >
                7 Jours
              </button>
              <button 
                onClick={() => setTimeRange(30)}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase rounded transition-all",
                  timeRange === 30 ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-900"
                )}
              >
                30 Jours
              </button>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#64748B" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fontWeight: 500 }}
                  dy={10}
                />
                <YAxis 
                  stroke="#64748B" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fontWeight: 500 }}
                  dx={-10}
                />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9', opacity: 0.4 }}
                  contentStyle={{ 
                    backgroundColor: '#ffffff', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                  itemStyle={{ color: '#20426B', fontWeight: 600 }}
                  labelStyle={{ color: '#64748b', marginBottom: '4px', fontSize: '12px' }}
                />
                <Bar dataKey="presences" fill="#20426B" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-[var(--color-bg-sidebar)] border border-[var(--color-border)] p-8 rounded-lg shadow-sm flex flex-col">
          <div className="mb-10">
            <h3 className="text-lg font-bold text-slate-900">Répartition des Rôles</h3>
            <p className="text-sm text-slate-500">Structure de l'équipe</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="h-[250px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={roleDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={10}
                    dataKey="value"
                    stroke="none"
                  >
                    {roleDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0', 
                      borderRadius: '8px' 
                    }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold text-slate-900">{filteredUsers.length}</span>
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">Membres</span>
              </div>
            </div>
            <div className="w-full space-y-3 mt-8">
              {roleDistribution.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="text-sm font-medium text-slate-600">{entry.name}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
