import React, { useState, useEffect } from 'react';
import { Modal } from './ui/Modal.tsx';
import { api } from '../lib/api.ts';
import { Users, Shield, Check, AlertCircle } from 'lucide-react';
import { UserRole } from '../../shared/types/index.ts';

interface AdminUserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminUserManagementModal: React.FC<AdminUserManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminUsers();
      setUsers(res.users || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load user profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await api.updateUserRole(userId, newRole);
      setSuccessMsg(`Role updated to ${newRole}`);
      await fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update role');
    }
  };

  const handleStatusToggle = async (userId: string, currentStatus: boolean) => {
    try {
      await api.updateUserStatus(userId, !currentStatus);
      setSuccessMsg(`User status updated`);
      await fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update status');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="User Roles & Access Control"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4 font-mono text-xs">
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-center space-x-2">
            <Check className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="p-3 bg-[#F9F8F6] border border-[#141414] text-neutral-600">
          <div className="font-bold text-[#141414] uppercase mb-1">Access Control Roles:</div>
          <div>• <span className="font-bold">Admin:</span> Full database, model, profile, and user configuration rights.</div>
          <div>• <span className="font-bold">Reviewer:</span> Ingests YouTube URLs, verifies specifications in review tab, and commits data.</div>
          <div>• <span className="font-bold">Viewer:</span> Public read-only access to browse, compare, and inspect verified reports.</div>
        </div>

        {loading ? (
          <div className="p-6 text-center text-neutral-500">Loading user profiles...</div>
        ) : (
          <div className="border border-[#141414] bg-white overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-100 border-b border-[#141414] uppercase text-neutral-600 font-bold">
                  <th className="py-2.5 px-3">Display Name / Email</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-neutral-50">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-[#141414]">{u.display_name || 'User'}</div>
                      <div className="text-[10px] text-neutral-400">{u.id}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                        className="px-2 py-1 border border-[#141414] bg-white text-xs font-mono font-bold focus:outline-none"
                      >
                        <option value="viewer">viewer</option>
                        <option value="reviewer">reviewer</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${
                          u.is_active
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleStatusToggle(u.id, u.is_active)}
                        className="px-2 py-1 border border-[#141414] bg-white hover:bg-neutral-100 text-[10px] font-bold uppercase cursor-pointer"
                      >
                        {u.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};
