import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { UserProfile, CheckInRecord } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Search, User as UserIcon, Clock, CheckCircle2, LogOut, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { LiveTimer } from '../components/LiveTimer';

export default function Pointage() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [userStatus, setUserStatus] = useState<Record<string, CheckInRecord | null>>({});
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState<{ text: string, type: 'in' | 'out' } | null>(null);

  useEffect(() => {
    // Fetch all workers
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const allUsers = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(allUsers.filter(u => u.role === 'worker'));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    // Fetch last check-in for each user to determine status
    const checkinsUnsubscribe = onSnapshot(collection(db, 'checkins'), (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CheckInRecord));
      const lastRecords: Record<string, CheckInRecord> = {};
      
      // Sort by timestamp desc to get the latest for each user
      records.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
      
      records.forEach(record => {
        if (!lastRecords[record.userId]) {
          lastRecords[record.userId] = record;
        }
      });

      const statusMap: Record<string, CheckInRecord | null> = {};
      users.forEach(user => {
        const last = lastRecords[user.uid];
        statusMap[user.uid] = last?.type === 'check-in' ? last : null;
      });
      setUserStatus(statusMap);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'checkins'));

    return () => {
      usersUnsubscribe();
      checkinsUnsubscribe();
    };
  }, [users.length]);

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

  const handlePointage = async (userId: string, type: 'check-in' | 'check-out') => {
    if (!profile) return;

    try {
      const location = await getCurrentLocation();
      
      const newRecord: any = {
        userId,
        checkedInBy: profile.uid,
        type,
        status: 'pending',
        timestamp: Timestamp.now(),
      };

      if (location) {
        newRecord.location = location;
      }

      if (type === 'check-out' && userStatus[userId]?.id) {
        newRecord.sessionId = userStatus[userId]?.id;
        const checkInTime = userStatus[userId]?.timestamp.toMillis();
        if (checkInTime) {
          newRecord.durationMinutes = Math.round((Timestamp.now().toMillis() - checkInTime) / (1000 * 60));
        }
      }

      await addDoc(collection(db, 'checkins'), newRecord);
      
      setSuccessMessage({ 
        text: type === 'check-in' ? 'Arrivée enregistrée !' : 'Départ enregistré !', 
        type 
      });
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error recording pointage:', error);
    }
  };

  const filteredUsers = users.filter(user => 
    user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Pointage Équipe</h1>
          <p className="text-slate-500 mt-1">Gérez les arrivées et départs des workers en temps réel.</p>
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

      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`p-4 rounded-lg flex items-center gap-3 shadow-sm border ${successMessage.type === 'in' ? 'bg-brand/10 border-brand/20 text-brand' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}
          >
            <CheckCircle2 size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">{successMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredUsers.map((user) => {
          const activeSession = userStatus[user.uid];
          return (
            <motion.div
              layout
              key={user.uid}
              className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 rounded-xl shadow-sm hover:border-brand/30 transition-all group"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-slate-50 border border-[var(--color-border)] rounded-lg flex items-center justify-center overflow-hidden">
                  {user.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : <UserIcon size={20} className="text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm truncate group-hover:text-brand transition-colors">{user.displayName}</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold truncate">{user.department || 'Général'}</p>
                </div>
                <div className={`w-2 h-2 rounded-full ${activeSession ? 'bg-brand animate-pulse' : 'bg-slate-200'}`}></div>
              </div>

              {activeSession ? (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-[var(--color-border)] rounded-lg p-4 flex flex-col items-center">
                    <span className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">En service depuis {format(activeSession.timestamp.toDate(), 'HH:mm')}</span>
                    <LiveTimer startTime={activeSession.timestamp.toDate()} className="text-2xl font-mono font-bold text-brand" />
                  </div>
                  <button
                    onClick={() => handlePointage(user.uid, 'check-out')}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 text-sm shadow-sm transition-all active:scale-[0.98]"
                  >
                    <LogOut size={18} />
                    Demander le départ
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-[var(--color-border)] rounded-lg p-4 flex flex-col items-center">
                    <span className="text-[10px] text-slate-500 uppercase font-bold mb-1 tracking-widest">Dernière activité</span>
                    <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Hors service</span>
                  </div>
                  <button
                    onClick={() => handlePointage(user.uid, 'check-in')}
                    className="w-full bg-brand hover:bg-brand-hover text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 text-sm shadow-sm transition-all active:scale-[0.98]"
                  >
                    <Clock size={18} />
                    Demander l'arrivée
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}

        {filteredUsers.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-slate-300">
              <Search size={32} />
            </div>
            <h3 className="text-slate-900 font-bold text-lg">Aucun worker trouvé</h3>
            <p className="text-slate-500 text-sm mt-2">Essayez de modifier vos critères de recherche.</p>
          </div>
        )}
      </div>
    </div>
  );
}
