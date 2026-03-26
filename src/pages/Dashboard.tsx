import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, Timestamp, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { CheckInRecord, UserProfile } from '../types';
import { LiveTimer } from '../components/LiveTimer';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Clock, Users, Calendar, TrendingUp, AlertCircle, CheckCircle2, User as UserIcon, ArrowRight, History as HistoryIcon, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function Dashboard() {
  const { profile } = useAuth();
  const [activeSession, setActiveSession] = useState<CheckInRecord | null>(null);
  const [activeSessions, setActiveSessions] = useState<CheckInRecord[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [stats, setStats] = useState({ present: 0, total: 0, hoursToday: 0, weeklyHours: 0, weeklyProgress: 0, alerts: 0 });
  const [nextEvent, setNextEvent] = useState('Aucun événement');
  const [pendingRequest, setPendingRequest] = useState<CheckInRecord | null>(null);
  const [loading, setLoading] = useState(false);

  const isAdminOrSuper = profile?.role === 'super_admin' || profile?.role === 'admin_rh' || profile?.role === 'superviseur';

  useEffect(() => {
    if (!profile) return;

    // Worker: Fetch own active session and pending requests
    if (!isAdminOrSuper) {
      const q = query(
        collection(db, 'checkins'),
        where('userId', '==', profile.uid),
        orderBy('timestamp', 'desc'),
        limit(5)
      );

      return onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CheckInRecord));
        
        // Find active session (confirmed check-in)
        const lastConfirmed = records.find(r => r.status === 'confirmed' || !r.status);
        if (lastConfirmed?.type === 'check-in') {
          setActiveSession(lastConfirmed);
        } else {
          setActiveSession(null);
        }

        // Find pending request
        const pending = records.find(r => r.status === 'pending');
        setPendingRequest(pending || null);
      }, (error) => handleFirestoreError(error, OperationType.GET, 'checkins'));
    }

    // Admin/Super: Fetch all active sessions and users
    if (isAdminOrSuper) {
      // Fetch users
      const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data() as UserProfile);
        setAllUsers(users);
        setStats(prev => ({ ...prev, total: users.length }));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

      // Fetch active check-ins (this is a bit tricky with Firestore, usually we'd have a separate 'active_sessions' collection or flag on user)
      // For simplicity in this demo, we'll fetch recent check-ins and filter in memory
      const checkinsQuery = query(
        collection(db, 'checkins'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );

      const checkinsUnsubscribe = onSnapshot(checkinsQuery, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CheckInRecord));
        const userLastRecord: Record<string, CheckInRecord> = {};
        
        records.forEach(record => {
          if (!userLastRecord[record.userId]) {
            userLastRecord[record.userId] = record;
          }
        });

        const active = Object.values(userLastRecord).filter(r => r.type === 'check-in');
        
        // Calculate alerts (sessions > 8h)
        const now = new Date().getTime();
        const alertsCount = active.filter(session => {
          const duration = now - session.timestamp.toMillis();
          return duration > (8 * 60 * 60 * 1000);
        }).length;

        setActiveSessions(active);
        setStats(prev => ({ ...prev, present: active.length, alerts: alertsCount }));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'checkins'));

      // Fetch all checkins for stats calculation
      const allCheckinsQuery = query(collection(db, 'checkins'), orderBy('timestamp', 'desc'));
      const allCheckinsUnsubscribe = onSnapshot(allCheckinsQuery, (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CheckInRecord));
        
        // Calculate hours today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let totalHoursToday = 0;
        const checkOuts = records.filter(r => r.type === 'check-out' && r.timestamp.toDate() >= today);
        
        checkOuts.forEach(out => {
          const matchingIn = records.find(r => r.id === out.sessionId);
          if (matchingIn) {
            const duration = out.timestamp.toMillis() - matchingIn.timestamp.toMillis();
            totalHoursToday += duration / (1000 * 60 * 60);
          }
        });

        // Calculate weekly hours
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        let totalWeeklyHours = 0;
        const weeklyCheckOuts = records.filter(r => r.type === 'check-out' && r.timestamp.toDate() >= startOfWeek);
        
        weeklyCheckOuts.forEach(out => {
          const matchingIn = records.find(r => r.id === out.sessionId);
          if (matchingIn) {
            const duration = out.timestamp.toMillis() - matchingIn.timestamp.toMillis();
            totalWeeklyHours += duration / (1000 * 60 * 60);
          }
        });

        // If worker, calculate their specific weekly hours
        if (!isAdminOrSuper) {
          let workerWeeklyHours = 0;
          const workerWeeklyOuts = records.filter(r => r.userId === profile.uid && r.type === 'check-out' && r.timestamp.toDate() >= startOfWeek);
          workerWeeklyOuts.forEach(out => {
            const matchingIn = records.find(r => r.id === out.sessionId);
            if (matchingIn) {
              const duration = out.timestamp.toMillis() - matchingIn.timestamp.toMillis();
              workerWeeklyHours += duration / (1000 * 60 * 60);
            }
          });
          
          const progress = Math.min(100, (workerWeeklyHours / 35) * 100); // Assuming 35h goal
          setStats(prev => ({ ...prev, weeklyHours: workerWeeklyHours, weeklyProgress: progress }));
        }

        setStats(prev => ({ ...prev, hoursToday: totalHoursToday }));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'checkins'));

      return () => {
        usersUnsubscribe();
        checkinsUnsubscribe();
        allCheckinsUnsubscribe();
      };
    }
  }, [profile, isAdminOrSuper]);

  const getCurrentLocation = (): Promise<{ latitude: number; longitude: number; accuracy: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          console.warn('Geolocation error:', error);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    });
  };

  const handleConfirmRequest = async (record: CheckInRecord) => {
    if (!record.id) return;
    setLoading(true);
    try {
      const location = await getCurrentLocation();
      const updates: any = {
        status: 'confirmed',
        timestamp: Timestamp.now(), // Update to actual confirmation time
      };
      if (location) {
        updates.location = location;
      }
      await updateDoc(doc(db, 'checkins', record.id), updates);
    } catch (error) {
      console.error('Error confirming pointage:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelfPointage = async (type: 'check-in' | 'check-out') => {
    if (!profile) return;
    setLoading(true);
    try {
      const location = await getCurrentLocation();
      const newRecord: any = {
        userId: profile.uid,
        checkedInBy: profile.uid, // Self
        type,
        status: 'confirmed',
        timestamp: Timestamp.now(),
      };

      if (location) {
        newRecord.location = location;
      }

      if (type === 'check-out' && activeSession?.id) {
        newRecord.sessionId = activeSession.id;
        const checkInTime = activeSession.timestamp.toMillis();
        newRecord.durationMinutes = Math.round((Timestamp.now().toMillis() - checkInTime) / (1000 * 60));
      }

      await addDoc(collection(db, 'checkins'), newRecord);
    } catch (error) {
      console.error('Error recording self-pointage:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Tableau de bord</h1>
          <p className="text-slate-500 mt-1">
            {isAdminOrSuper 
              ? `Suivi en temps réel des équipes (${stats.present}/${stats.total} présents)`
              : `Bienvenue, ${profile?.displayName}. Voici votre activité.`
            }
          </p>
        </div>
        <div className="flex items-center gap-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] px-4 py-2 rounded-lg shadow-sm">
          <Calendar size={16} className="text-brand" />
          <span className="text-xs font-medium text-slate-700 capitalize">
            {format(new Date(), 'EEEE d MMMM', { locale: fr })}
          </span>
        </div>
      </header>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-6 rounded-xl shadow-sm hover:border-brand/30 transition-colors">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Heures cumulées (J)</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.hoursToday.toFixed(1)}h</p>
            <span className="text-brand text-[10px] font-bold">Aujourd'hui</span>
          </div>
        </div>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-6 rounded-xl shadow-sm hover:border-brand/30 transition-colors">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Taux de présence</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0}%</p>
            <span className="text-slate-500 text-[10px] font-bold">{stats.present}/{stats.total} actifs</span>
          </div>
        </div>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-6 rounded-xl shadow-sm hover:border-brand/30 transition-colors">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Objectif Hebdo</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-slate-900 tracking-tight">{stats.weeklyHours.toFixed(1)}h</p>
            <span className="text-slate-500 text-[10px] font-bold">/ 35h</span>
          </div>
        </div>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-6 rounded-xl shadow-sm hover:border-brand/30 transition-colors">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Alertes (8h+)</p>
          <div className="flex items-baseline gap-2">
            <p className={`text-3xl font-bold tracking-tight ${stats.alerts > 0 ? 'text-red-500' : 'text-slate-400'}`}>{stats.alerts}</p>
            {stats.alerts > 0 && <span className="text-red-500 text-[10px] font-bold animate-pulse">Attention</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Sessions Section */}
          <section className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="text-brand" size={16} />
                {isAdminOrSuper ? 'Sessions Actives' : 'Mon Statut Actuel'}
              </h2>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
                <span className="text-brand text-[10px] font-bold uppercase tracking-wider">Live</span>
              </div>
            </div>
            
            <div className="p-6">
              {isAdminOrSuper ? (
                activeSessions.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {activeSessions.map((session) => (
                      <div key={session.id || session.userId} className="flex items-center justify-between p-4 bg-slate-50 border border-[var(--color-border)] rounded-lg hover:border-brand/30 transition-all group">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white border border-[var(--color-border)] rounded-md flex items-center justify-center text-slate-400 overflow-hidden">
                            {allUsers.find(u => u.uid === session.userId)?.photoURL 
                              ? <img src={allUsers.find(u => u.uid === session.userId)?.photoURL} className="w-full h-full object-cover" />
                              : <UserIcon size={18} />
                            }
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm truncate max-w-[120px]">
                              {allUsers.find(u => u.uid === session.userId)?.displayName || 'Worker'}
                            </p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                              Début: {format(session.timestamp.toDate(), 'HH:mm')}
                            </p>
                          </div>
                        </div>
                        <LiveTimer startTime={session.timestamp.toDate()} className="text-brand font-mono text-sm font-bold" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                      <Clock size={24} />
                    </div>
                    <p className="text-slate-500 text-sm">Aucune session active pour le moment.</p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center py-8 text-center">
                  {activeSession ? (
                    <>
                      <LiveTimer startTime={activeSession.timestamp.toDate()} className="text-6xl font-bold text-slate-900 tracking-tighter mb-2" />
                      <p className="text-slate-500 text-sm mb-6">En service depuis {format(activeSession.timestamp.toDate(), 'HH:mm')}</p>
                      <div className="px-4 py-2 bg-brand/10 border border-brand/20 rounded-full flex items-center gap-2 mb-6">
                        <CheckCircle2 className="text-brand" size={16} />
                        <span className="text-brand text-xs font-bold uppercase tracking-wider">Pointage Actif</span>
                      </div>
                      <button
                        onClick={() => handleSelfPointage('check-out')}
                        disabled={loading}
                        className="w-full max-w-xs bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        <LogOut size={18} />
                        Pointer mon départ
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 text-slate-300">
                        <Clock size={32} />
                      </div>
                      <h3 className="text-slate-900 font-bold text-lg">Hors service</h3>
                      <p className="text-slate-500 text-sm max-w-xs mt-2 mb-6">
                        Votre arrivée n'a pas encore été enregistrée.
                      </p>
                      <button
                        onClick={() => handleSelfPointage('check-in')}
                        disabled={loading}
                        className="w-full max-w-xs bg-brand hover:bg-brand-hover text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        <Clock size={18} />
                        Pointer mon arrivée
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Pending Requests Section */}
          {!isAdminOrSuper && pendingRequest && (
            <section className="bg-brand/5 border-2 border-brand/20 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="px-6 py-4 border-b border-brand/10 flex items-center justify-between bg-brand/10">
                <h2 className="text-sm font-bold text-brand flex items-center gap-2">
                  <AlertCircle size={16} />
                  Action Requise : Confirmation de Pointage
                </h2>
              </div>
              <div className="p-8 text-center">
                <p className="text-slate-700 font-medium mb-6">
                  Un superviseur a demandé votre <span className="font-bold text-brand">{pendingRequest.type === 'check-in' ? 'arrivée' : 'départ'}</span>. 
                  Veuillez confirmer pour capturer votre position.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => handleConfirmRequest(pendingRequest)}
                    disabled={loading}
                    className="w-full sm:w-auto px-8 py-3 bg-brand text-white font-bold rounded-xl shadow-lg hover:bg-brand-hover transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    Confirmer et Partager ma position
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Weekly Progress Section */}
          <section className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-[var(--color-border)] bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="text-brand" size={16} />
                Progression Hebdomadaire
              </h2>
            </div>
            <div className="p-8">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-4xl font-bold text-slate-900 tracking-tight">{stats.weeklyHours.toFixed(1)}h</p>
                  <p className="text-slate-500 text-xs mt-1">Objectif: 35h / semaine</p>
                </div>
                <div className="text-right">
                  <p className="text-brand font-bold text-lg">{Math.round(stats.weeklyProgress)}%</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Complété</p>
                </div>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-[var(--color-border)]">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.weeklyProgress}%` }}
                  className="h-full bg-brand shadow-[0_0_10px_rgba(32,66,107,0.3)]"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar Area */}
        <div className="space-y-8">
          {/* Next Event Section */}
          <section className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-[var(--color-border)] bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="text-brand" size={16} />
                Prochain Événement
              </h2>
            </div>
            <div className="p-8 text-center">
              <div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                <Calendar size={28} />
              </div>
              <p className="text-slate-900 font-bold text-sm mb-1">{nextEvent}</p>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Aucune planification</p>
            </div>
          </section>

          {/* Quick Actions Section */}
          <section className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm p-6">
            <h3 className="text-xs font-bold text-slate-900 mb-4 uppercase tracking-wider text-slate-500">Actions Rapides</h3>
            <div className="grid grid-cols-1 gap-2">
              {isAdminOrSuper && (
                <Link to="/pointage" className="flex items-center justify-between p-3 bg-slate-50 border border-[var(--color-border)] rounded-lg hover:border-brand/30 hover:bg-brand/5 transition-all group">
                  <div className="flex items-center gap-3">
                    <Clock size={16} className="text-slate-400 group-hover:text-brand" />
                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">Nouveau Pointage</span>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 group-hover:text-brand" />
                </Link>
              )}
              <Link to="/historique" className="flex items-center justify-between p-3 bg-slate-50 border border-[var(--color-border)] rounded-lg hover:border-brand/30 hover:bg-brand/5 transition-all group">
                <div className="flex items-center gap-3">
                  <HistoryIcon size={16} className="text-slate-400 group-hover:text-brand" />
                  <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">Voir Historique</span>
                </div>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-brand" />
              </Link>
              {profile?.role === 'super_admin' && (
                <Link to="/admin" className="flex items-center justify-between p-3 bg-slate-50 border border-[var(--color-border)] rounded-lg hover:border-brand/30 hover:bg-brand/5 transition-all group">
                  <div className="flex items-center gap-3">
                    <Users size={16} className="text-slate-400 group-hover:text-brand" />
                    <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900">Gérer l'équipe</span>
                  </div>
                  <ArrowRight size={14} className="text-slate-300 group-hover:text-brand" />
                </Link>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
