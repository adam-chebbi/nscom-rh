import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, UserRole } from '../types';
import { motion } from 'motion/react';
import { Users, UserPlus, Shield, Trash2, Edit2, CheckCircle2, XCircle, Search, Mail, User as UserIcon, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Admin() {
  const { profile: currentUserProfile, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    role: 'worker' as UserRole,
    department: '',
    uid: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
    return () => unsubscribe();
  }, []);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const trimmedEmail = formData.email.trim();
      const trimmedPassword = formData.password.trim();
      const trimmedDisplayName = formData.displayName.trim();

      if (!editingUser && trimmedPassword.length < 6) {
        throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
      }

      if (editingUser) {
        // Update existing user profile in Firestore
        await updateDoc(doc(db, 'users', editingUser.uid), {
          displayName: trimmedDisplayName,
          role: formData.role,
          department: formData.department
        });
        
        // If password is provided, update it via API
        if (trimmedPassword) {
          const token = await currentUser?.getIdToken();
          const response = await fetch('/api/users/update-password', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ uid: editingUser.uid, password: trimmedPassword })
          });
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update password');
          }
        }
        setSuccess('Utilisateur mis à jour avec succès.');
      } else {
        // Create new user via API
        const token = await currentUser?.getIdToken();
        const response = await fetch('/api/users/create', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            email: trimmedEmail,
            password: trimmedPassword,
            displayName: trimmedDisplayName,
            role: formData.role,
            department: formData.department
          })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create user');
        }
        setSuccess('Utilisateur créé avec succès.');
      }
      setIsModalOpen(false);
      setEditingUser(null);
      setFormData({ displayName: '', email: '', role: 'worker', department: '', uid: '', password: '' });
    } catch (error: any) {
      console.error('Error saving user:', error);
      setError(error.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      const token = await currentUser?.getIdToken();
      const response = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid: userToDelete })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    } catch (error: any) {
      console.error('Error deleting user:', error);
      setError(error.message);
      setIsDeleteModalOpen(false);
    }
  };

  const confirmDelete = (uid: string) => {
    setUserToDelete(uid);
    setIsDeleteModalOpen(true);
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      department: user.department || '',
      uid: user.uid,
      password: ''
    });
    setIsModalOpen(true);
  };

  const departments = Array.from(new Set(users.map(u => u.department).filter(Boolean))) as string[];

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesDept = deptFilter === 'all' || user.department === deptFilter;
    return matchesSearch && matchesRole && matchesDept;
  });

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Gestion des Utilisateurs</h1>
          <p className="text-slate-500 mt-1">Gérez les comptes, les rôles et les accès de l'agence.</p>
        </div>
        <button 
          onClick={() => { setEditingUser(null); setFormData({ displayName: '', email: '', role: 'worker', department: '', uid: '', password: '' }); setIsModalOpen(true); }}
          className="bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2"
        >
          <UserPlus size={18} />
          Ajouter un Worker
        </button>
      </header>

      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-[var(--color-border)] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50">
          <div className="flex flex-col md:flex-row items-center gap-4 flex-1">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-[var(--color-border)] rounded-lg py-2 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand/50 transition-all"
              />
            </div>
            
            <select 
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="w-full md:w-40 bg-slate-50 border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-slate-900 focus:outline-none focus:border-brand/50 transition-all"
            >
              <option value="all">Tous les rôles</option>
              <option value="worker">Worker</option>
              <option value="superviseur">Superviseur</option>
              <option value="admin_rh">Admin RH</option>
              <option value="super_admin">Super Admin</option>
              <option value="observateur">Observateur</option>
            </select>

            <select 
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full md:w-40 bg-slate-50 border border-[var(--color-border)] rounded-lg py-2 px-3 text-sm text-slate-900 focus:outline-none focus:border-brand/50 transition-all"
            >
              <option value="all">Tous les départements</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider">
            <Users size={14} className="text-brand" />
            <span>{filteredUsers.length} Utilisateurs</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest font-bold border-b border-[var(--color-border)]">
                <th className="px-6 py-4">Utilisateur</th>
                <th className="px-6 py-4">Rôle</th>
                <th className="px-6 py-4">Département</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filteredUsers.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-50 border border-[var(--color-border)] rounded-lg flex items-center justify-center overflow-hidden">
                        {user.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : <UserIcon size={16} className="text-slate-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate group-hover:text-brand transition-colors">{user.displayName}</p>
                        <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-slate-50 border border-[var(--color-border)] text-slate-600 rounded-md text-[9px] font-bold uppercase tracking-wider">
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-xs font-medium">
                    {user.department || '—'}
                  </td>
                  <td className="px-6 py-4">
                    {user.isActive ? (
                      <span className="flex items-center gap-1.5 text-brand text-[10px] font-bold uppercase tracking-wider">
                        <div className="w-1 h-1 bg-brand rounded-full" /> Actif
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                        <div className="w-1 h-1 bg-slate-400 rounded-full" /> Inactif
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => openEditModal(user)}
                        className="p-2 hover:bg-brand/10 text-slate-400 hover:text-brand rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      {currentUserProfile?.role === 'super_admin' && (
                        <button 
                          onClick={() => confirmDelete(user.uid)}
                          className="p-2 hover:bg-red-500/10 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                          disabled={user.uid === currentUserProfile?.uid}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal User Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--color-bg-card)] border border-[var(--color-border)] w-full max-w-md rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{editingUser ? 'Modifier Utilisateur' : 'Ajouter un Utilisateur'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                <XCircle size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveUser} className="p-6 space-y-5">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nom complet</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    required
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full bg-slate-50 border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:border-brand/50 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="email"
                    required
                    disabled={!!editingUser}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:border-brand/50 transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                  {editingUser ? 'Nouveau mot de passe (Laisser vide pour ne pas changer)' : 'Mot de passe'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-slate-50 border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:border-brand/50 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Rôle</label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                      className="w-full bg-slate-50 border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-slate-900 appearance-none focus:outline-none focus:border-brand/50 transition-all"
                    >
                      <option value="worker">Worker</option>
                      <option value="superviseur">Superviseur</option>
                      <option value="admin_rh">Admin RH</option>
                      <option value="super_admin">Super Admin</option>
                      <option value="observateur">Observateur</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Département</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full bg-slate-50 border border-[var(--color-border)] rounded-lg py-2 px-4 text-sm text-slate-900 focus:outline-none focus:border-brand/50 transition-all"
                    placeholder="ex. Animation"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold py-2.5 rounded-lg text-sm transition-all"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-brand hover:bg-brand-hover text-white font-bold py-2.5 rounded-lg text-sm shadow-sm transition-all active:scale-[0.98]"
                >
                  {editingUser ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsDeleteModalOpen(false)}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 overflow-hidden border border-red-100"
          >
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="text-red-500" size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Supprimer l'utilisateur ?</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                Cette action est irréversible. Toutes les données associées (pointages, historique) seront également supprimées.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold py-3 rounded-xl text-sm transition-all"
                >
                  Annuler
                </button>
                <button 
                  onClick={handleDeleteUser}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-red-500/20 transition-all active:scale-[0.98]"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
