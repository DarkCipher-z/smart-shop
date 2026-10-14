import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UserCog,
  UserPlus,
  KeyRound,
  Edit,
  Shield,
  Store,
  Mail,
  CheckCircle,
} from 'lucide-react';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';

export default function UserManagement() {
  const { t } = useTranslation();
  const { success, error: toastError } = useToast();

  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit user modal
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ full_name: '', email: '', role: 'cashier', shop_id: 1 });
  const [savingUser, setSavingUser] = useState(false);

  // Password reset modal
  const [resettingUser, setResettingUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // New user modal
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'cashier',
    shop_id: 1,
  });
  const [creatingUser, setCreatingUser] = useState(false);

  const fetchUsersAndShops = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, shopsRes] = await Promise.all([
        api.get('/admin/users').catch(async () => await api.get('/users').catch(() => [])),
        api.get('/shops').catch(() => []),
      ]);

      const userList = usersRes?.data || usersRes?.users || (Array.isArray(usersRes) ? usersRes : []);
      const shopList = shopsRes?.data || shopsRes?.shops || (Array.isArray(shopsRes) ? shopsRes : []);

      setUsers(userList);
      setShops(shopList);
    } catch (err) {
      toastError(err.message || 'Failed to load system user accounts');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchUsersAndShops();
  }, [fetchUsersAndShops]);

  // Open Edit User
  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setUserForm({
      full_name: user.full_name || user.fullName || user.name || '',
      email: user.email || '',
      role: user.role || 'cashier',
      shop_id: user.shop_id || user.shopId || 1,
    });
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userForm.full_name || !userForm.email) {
      toastError('Name and Email are required.');
      return;
    }

    setSavingUser(true);
    try {
      await api.put(`/admin/users/${editingUser.id}`, userForm).catch(async () => {
        return await api.put(`/users/${editingUser.id}`, userForm);
      });
      success('User profile updated successfully.');
      setEditingUser(null);
      fetchUsersAndShops();
    } catch (err) {
      toastError(err.message || 'Failed to update user profile');
    } finally {
      setSavingUser(false);
    }
  };

  // Open Reset Password
  const handleOpenReset = (user) => {
    setResettingUser(user);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toastError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toastError('Passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await api.post(`/admin/users/${resettingUser.id}/reset-password`, {
        password: newPassword,
      }).catch(async () => {
        return await api.put(`/users/${resettingUser.id}`, { password: newPassword });
      });

      success(`Password reset for ${resettingUser.email}`);
      setResettingUser(null);
    } catch (err) {
      toastError(err.message || 'Failed to reset password');
    } finally {
      setSavingPassword(false);
    }
  };

  // Create New User
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.email || !newUserForm.password) {
      toastError('Email and Password are required.');
      return;
    }

    setCreatingUser(true);
    try {
      await api.post('/admin/users', newUserForm).catch(async () => {
        return await api.post('/users', newUserForm);
      });
      success('New user account created successfully.');
      setShowAddUserModal(false);
      setNewUserForm({ full_name: '', email: '', password: '', role: 'cashier', shop_id: 1 });
      fetchUsersAndShops();
    } catch (err) {
      toastError(err.message || 'Failed to create user account');
    } finally {
      setCreatingUser(false);
    }
  };

  const columns = [
    {
      header: 'User Account',
      accessor: 'full_name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {(row.full_name || row.fullName || row.name || 'U').charAt(0)}
          </div>
          <div>
            <span className="font-bold text-gray-100 block">
              {row.full_name || row.fullName || row.name}
            </span>
            <span className="text-xs text-gray-400 font-mono">{row.email}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Assigned Shop',
      accessor: 'shop_id',
      render: (row) => {
        if (row.role === 'admin') {
          return (
            <Badge variant="cyan" size="sm">
              Global (All Shops)
            </Badge>
          );
        }
        const shop = shops.find((s) => s.id === (row.shop_id || row.shopId));
        return (
          <span className="text-xs font-semibold text-gray-200">
            {shop?.name || `Shop #${row.shop_id || row.shopId || 1}`}
          </span>
        );
      },
    },
    {
      header: 'Security Role',
      accessor: 'role',
      render: (row) => {
        const isAdm = row.role === 'admin';
        const isOwn = row.role === 'owner';
        return (
          <Badge variant={isAdm ? 'violet' : isOwn ? 'info' : 'neutral'} size="sm" dot>
            {isAdm ? 'Super Admin' : isOwn ? 'Store Owner' : 'Cashier'}
          </Badge>
        );
      },
    },
    {
      header: 'Status',
      render: () => (
        <Badge variant="success" size="sm">
          Active
        </Badge>
      ),
    },
    {
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleOpenReset(row)}
            title="Reset Password"
            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenEdit(row)}
            title="Edit User"
            className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-cyan-600/15 text-cyan-400 border border-cyan-500/20">
            <UserCog className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {t('admin.userManagement')}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Control access roles, shop permissions and user passwords
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={UserPlus}
          onClick={() => setShowAddUserModal(true)}
        >
          Create User Account
        </Button>
      </div>

      {/* Users Table */}
      <Table
        columns={columns}
        data={users}
        isLoading={loading}
        emptyTitle="No system users found"
        emptyDescription="Create user accounts to assign to retail locations."
        pageSize={10}
      />

      {/* EDIT USER MODAL */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Edit System User"
        subtitle={`Editing ${editingUser?.email}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveUser}
              isLoading={savingUser}
            >
              Update User
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveUser} className="space-y-3">
          <Input
            label="Full Name *"
            value={userForm.full_name}
            onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
            required
            autoFocus
          />
          <Input
            label="Email Address *"
            type="email"
            value={userForm.email}
            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            required
          />
          <Select
            label="Access Role *"
            value={userForm.role}
            onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
          >
            <option value="cashier">Cashier (POS & Billing)</option>
            <option value="owner">Store Owner / Manager (Full Store Access)</option>
            <option value="admin">Super Admin (Multi-store Global Access)</option>
          </Select>

          {userForm.role !== 'admin' && (
            <Select
              label="Assigned Store Location *"
              value={userForm.shop_id}
              onChange={(e) => setUserForm({ ...userForm, shop_id: Number(e.target.value) })}
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </form>
      </Modal>

      {/* RESET PASSWORD MODAL */}
      <Modal
        isOpen={!!resettingUser}
        onClose={() => setResettingUser(null)}
        title="Reset Password"
        subtitle={`Target User: ${resettingUser?.email}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResettingUser(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSavePassword}
              isLoading={savingPassword}
            >
              Set New Password
            </Button>
          </>
        }
      >
        <form onSubmit={handleSavePassword} className="space-y-3">
          <Input
            label="New Password *"
            type="password"
            placeholder="At least 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Confirm New Password *"
            type="password"
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </form>
      </Modal>

      {/* CREATE NEW USER MODAL */}
      <Modal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        title="Create New System User"
        subtitle="Provision access for new store staff"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddUserModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateUser}
              isLoading={creatingUser}
            >
              Create Account
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUser} className="space-y-3">
          <Input
            label="Full Name *"
            placeholder="e.g. Rahul Sharma"
            value={newUserForm.full_name}
            onChange={(e) => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
            required
            autoFocus
          />
          <Input
            label="Email Address *"
            type="email"
            placeholder="user@smartshop.local"
            value={newUserForm.email}
            onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
            required
          />
          <Input
            label="Temporary Password *"
            type="password"
            placeholder="Enter secure initial password"
            value={newUserForm.password}
            onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
            required
          />
          <Select
            label="Access Role *"
            value={newUserForm.role}
            onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
          >
            <option value="cashier">Cashier (POS & Billing)</option>
            <option value="owner">Store Owner / Manager</option>
            <option value="admin">Super Admin</option>
          </Select>
          {newUserForm.role !== 'admin' && (
            <Select
              label="Assigned Store *"
              value={newUserForm.shop_id}
              onChange={(e) => setNewUserForm({ ...newUserForm, shop_id: Number(e.target.value) })}
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </form>
      </Modal>
    </div>
  );
}
