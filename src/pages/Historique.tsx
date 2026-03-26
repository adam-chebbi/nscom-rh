import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { CheckInRecord, UserProfile } from '../types';
import { format, startOfDay, endOfDay, subDays, differenceInMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Calendar, Filter, Search, User as UserIcon, Clock, ArrowRight, Download, LogOut, History as HistoryIcon, ChevronLeft, TrendingUp, Briefcase, MapPin, X } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet default icon issue
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Historique() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(profile?.role === 'worker' ? profile.uid : null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'active'>('all');
  const [selectedSession, setSelectedSession] = useState<any>(null);

  const isAdminOrSuper = profile?.role === 'super_admin' || profile?.role === 'admin_rh' || profile?.role === 'superviseur';

  useEffect(() => {
    // Fetch all workers for the directory
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const allUsers = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(allUsers.filter(u => u.role === 'worker'));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => usersUnsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const start = startOfDay(new Date(dateRange.start));
    const end = endOfDay(new Date(dateRange.end));

    const q = query(
      collection(db, 'checkins'),
      where('userId', '==', selectedUser),
      where('timestamp', '>=', Timestamp.fromDate(start)),
      where('timestamp', '<=', Timestamp.fromDate(end)),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CheckInRecord)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'checkins'));

    return () => unsubscribe();
  }, [selectedUser, dateRange]);

  const stats = useMemo(() => {
    if (records.length === 0) return { totalHours: 0, sessions: 0, avgSession: 0 };
    
    const checkOuts = records.filter(r => r.type === 'check-out');
    let totalMinutes = 0;
    
    checkOuts.forEach(out => {
      if (out.durationMinutes) {
        totalMinutes += out.durationMinutes;
      } else {
        // Fallback if durationMinutes wasn't saved
        const matchingIn = records.find(r => r.id === out.sessionId);
        if (matchingIn) {
          totalMinutes += differenceInMinutes(out.timestamp.toDate(), matchingIn.timestamp.toDate());
        }
      }
    });

    return {
      totalHours: (totalMinutes / 60).toFixed(1),
      sessions: checkOuts.length,
      avgSession: checkOuts.length > 0 ? (totalMinutes / checkOuts.length / 60).toFixed(1) : 0
    };
  }, [records]);

  const filteredUsers = users.filter(user => 
    user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedWorker = users.find(u => u.uid === selectedUser);

  const sessions = useMemo(() => {
    const checkIns = records.filter(r => r.type === 'check-in');
    const checkOuts = records.filter(r => r.type === 'check-out');
    
    let allSessions = checkIns.map(checkIn => {
      const checkOut = checkOuts.find(out => out.sessionId === checkIn.id);
      return {
        id: checkIn.id,
        date: checkIn.timestamp.toDate(),
        checkIn,
        checkOut: checkOut || null
      };
    });

    if (statusFilter === 'completed') {
      allSessions = allSessions.filter(s => s.checkOut !== null);
    } else if (statusFilter === 'active') {
      allSessions = allSessions.filter(s => s.checkOut === null);
    }

    return allSessions;
  }, [records, statusFilter]);

  const exportToCSV = () => {
    if (!selectedWorker) return;
    const headers = ['Date', 'Heure', 'Type', 'Worker', 'Pointé par', 'Durée (min)'];
    const rows = records.map(r => [
      format(r.timestamp.toDate(), 'dd/MM/yyyy'),
      format(r.timestamp.toDate(), 'HH:mm:ss'),
      r.type === 'check-in' ? 'Arrivée' : 'Départ',
      selectedWorker.displayName,
      users.find(u => u.uid === r.checkedInBy)?.displayName || r.checkedInBy,
      r.durationMinutes || ''
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `historique_${selectedWorker.displayName}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  if (isAdminOrSuper && !selectedUser) {
    return (
      <div className="space-y-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Historique & Rapports</h1>
            <p className="text-slate-500 mt-1">Sélectionnez un worker pour voir son historique détaillé.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher un worker..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg py-2.5 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand/50 transition-all"
            />
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredUsers.map((user) => (
            <motion.div
              layout
              key={user.uid}
              onClick={() => setSelectedUser(user.uid)}
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 rounded-xl shadow-sm hover:border-brand/30 transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-50 border border-[var(--color-border)] rounded-lg flex items-center justify-center overflow-hidden">
                  {user.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : <UserIcon size={20} className="text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm truncate group-hover:text-brand transition-colors">{user.displayName}</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold truncate">{user.department || 'Général'}</p>
                </div>
                <ArrowRight className="text-slate-300 group-hover:text-brand group-hover:translate-x-1 transition-all" size={16} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {isAdminOrSuper && (
            <button 
              onClick={() => setSelectedUser(null)}
              className="w-10 h-10 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-brand/30 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {isAdminOrSuper ? selectedWorker?.displayName : 'Mon Historique'}
            </h1>
            <p className="text-slate-500 mt-1">Relevés détaillés et statistiques de présence.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={exportToCSV}
            className="bg-brand hover:bg-brand-hover text-slate-900 px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2"
          >
            <Download size={18} />
            Exporter CSV
          </button>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-4 rounded-xl shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="flex items-center gap-2 flex-1 w-full">
          <Calendar size={18} className="text-slate-400" />
          <div className="flex items-center gap-2 flex-1">
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="bg-slate-50 border border-[var(--color-border)] rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand/50 flex-1"
            />
            <span className="text-slate-400 text-xs">à</span>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="bg-slate-50 border border-[var(--color-border)] rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand/50 flex-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={18} className="text-slate-400" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-50 border border-[var(--color-border)] rounded-md px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-brand/50 w-full md:w-40"
          >
            <option value="all">Tous les statuts</option>
            <option value="completed">Terminés</option>
            <option value="active">En cours</option>
          </select>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-6 rounded-xl shadow-sm">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Heures Totales</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.totalHours}h</p>
            <Clock className="text-brand" size={14} />
          </div>
        </div>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-6 rounded-xl shadow-sm">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Sessions</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.sessions}</p>
            <Briefcase className="text-brand" size={14} />
          </div>
        </div>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-6 rounded-xl shadow-sm">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Moyenne / Session</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.avgSession}h</p>
            <TrendingUp className="text-brand" size={14} />
          </div>
        </div>
      </div>

      {/* Timeline List */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-[var(--color-border)] bg-slate-50">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <HistoryIcon className="text-brand" size={16} />
            Journal d'activité
          </h2>
        </div>
        
        <div className="divide-y divide-[var(--color-border)]">
          {sessions.length > 0 ? (
            sessions.map((session, index) => (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.01 }}
                key={session.id}
                className="p-6 hover:bg-slate-50 transition-all flex flex-col lg:flex-row lg:items-center gap-6"
              >
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
                    <Clock size={20} />
                  </div>
                  <div className="lg:hidden">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Date</p>
                    <p className="text-slate-900 text-sm font-medium capitalize">{format(session.date, 'EEEE d MMMM', { locale: fr })}</p>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 items-center">
                  <div className="hidden lg:block">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Date</p>
                    <p className="text-slate-900 text-sm font-medium capitalize">{format(session.date, 'EEEE d MMMM', { locale: fr })}</p>
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Arrivée</p>
                    <p className="text-brand font-mono text-sm font-bold">{format(session.checkIn.timestamp.toDate(), 'HH:mm')}</p>
                    <p className="text-[10px] text-slate-400 truncate">Par {users.find(u => u.uid === session.checkIn.checkedInBy)?.displayName || 'Système'}</p>
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Départ</p>
                    {session.checkOut ? (
                      <>
                        <p className="text-red-500 font-mono text-sm font-bold">{format(session.checkOut.timestamp.toDate(), 'HH:mm')}</p>
                        <p className="text-[10px] text-slate-400 truncate">Par {users.find(u => u.uid === session.checkOut.checkedInBy)?.displayName || 'Système'}</p>
                      </>
                    ) : (
                      <p className="text-slate-400 text-sm font-medium italic">En cours...</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Durée</p>
                    <p className="text-slate-900 text-sm font-bold">
                      {session.checkOut 
                        ? (session.checkOut.durationMinutes ? `${Math.floor(session.checkOut.durationMinutes / 60)}h ${session.checkOut.durationMinutes % 60}m` : '—')
                        : '—'
                      }
                    </p>
                  </div>

                  <div className="col-span-2 md:col-span-1 flex items-center justify-end lg:justify-start gap-2">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Statut</p>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        session.checkOut ? "bg-slate-100 text-slate-600" : "bg-brand/10 text-brand animate-pulse"
                      )}>
                        {session.checkOut ? 'Terminé' : 'Présent'}
                      </span>
                    </div>
                    {(session.checkIn.location || session.checkOut?.location) && (
                      <button 
                        onClick={() => setSelectedSession(session)}
                        className="p-2 hover:bg-brand/10 text-brand rounded-lg transition-colors"
                        title="Voir la localisation"
                      >
                        <MapPin size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                <HistoryIcon size={32} />
              </div>
              <h3 className="text-slate-900 font-bold text-lg">Aucun historique trouvé</h3>
              <p className="text-slate-500 text-sm mt-2">Aucun enregistrement ne correspond à cet utilisateur.</p>
            </div>
          )}
        </div>
      </div>

      {/* Session Details Modal */}
      <AnimatePresence>
        {selectedSession && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between bg-slate-50">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">Détails de la Session</h2>
                  <p className="text-xs text-slate-500">{format(selectedSession.date, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                </div>
                <button onClick={() => setSelectedSession(null)} className="text-slate-400 hover:text-slate-900 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-lg border border-[var(--color-border)]">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Arrivée</p>
                    <p className="text-brand text-lg font-mono font-bold">{format(selectedSession.checkIn.timestamp.toDate(), 'HH:mm:ss')}</p>
                    {selectedSession.checkIn.location ? (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Lat: {selectedSession.checkIn.location.latitude.toFixed(6)}, Lng: {selectedSession.checkIn.location.longitude.toFixed(6)}
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-1 italic">Localisation non disponible</p>
                    )}
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-[var(--color-border)]">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">Départ</p>
                    {selectedSession.checkOut ? (
                      <>
                        <p className="text-red-500 text-lg font-mono font-bold">{format(selectedSession.checkOut.timestamp.toDate(), 'HH:mm:ss')}</p>
                        {selectedSession.checkOut.location ? (
                          <p className="text-[10px] text-slate-400 mt-1">
                            Lat: {selectedSession.checkOut.location.latitude.toFixed(6)}, Lng: {selectedSession.checkOut.location.longitude.toFixed(6)}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-400 mt-1 italic">Localisation non disponible</p>
                        )}
                      </>
                    ) : (
                      <p className="text-slate-400 text-lg font-medium italic">En cours...</p>
                    )}
                  </div>
                </div>

                <div className="h-80 rounded-xl overflow-hidden border border-[var(--color-border)] relative z-0">
                  <MapContainer 
                    center={[
                      selectedSession.checkIn.location?.latitude || selectedSession.checkOut?.location?.latitude || 48.8566,
                      selectedSession.checkIn.location?.longitude || selectedSession.checkOut?.location?.longitude || 2.3522
                    ]} 
                    zoom={13} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {selectedSession.checkIn.location && (
                      <Marker position={[selectedSession.checkIn.location.latitude, selectedSession.checkIn.location.longitude]}>
                        <Popup>
                          <div className="text-xs">
                            <p className="font-bold text-brand">Arrivée</p>
                            <p>{format(selectedSession.checkIn.timestamp.toDate(), 'HH:mm:ss')}</p>
                          </div>
                        </Popup>
                      </Marker>
                    )}
                    {selectedSession.checkOut?.location && (
                      <Marker position={[selectedSession.checkOut.location.latitude, selectedSession.checkOut.location.longitude]}>
                        <Popup>
                          <div className="text-xs">
                            <p className="font-bold text-red-500">Départ</p>
                            <p>{format(selectedSession.checkOut.timestamp.toDate(), 'HH:mm:ss')}</p>
                          </div>
                        </Popup>
                      </Marker>
                    )}
                  </MapContainer>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-[var(--color-border)] flex justify-end">
                <button 
                  onClick={() => setSelectedSession(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-bold transition-all"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
