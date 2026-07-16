import { useState, useEffect } from 'react';
import { api, ApiError } from '../../api/client';
import type { User } from '../../api/types';

export function UserManagementPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    try {
      // Assuming GET /users returns a list or a paginated list
      // Let's assume it returns an array of User directly for simplicity or Paginated<User>. 
      // The backend method I added `findAll` returns `Promise<User[]>`.
      const res = await api.get<User[]>('/users');
      setUsers(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (id: string, role: string) => {
    try {
      await api.patch(`/users/${id}/role`, { role });
      setUsers(users.map((u) => (u.id === id ? { ...u, role: role as 'USER' | 'ADMIN' } : u)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to assign role');
    }
  };

  if (loading) return <div>Loading users...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Users</h2>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
            <th style={{ padding: 8 }}>Email</th>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Joined</th>
            <th style={{ padding: 8 }}>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 8 }}>{u.email}</td>
              <td style={{ padding: 8 }}>{u.firstName} {u.lastName}</td>
              <td style={{ padding: 8 }}>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td style={{ padding: 8 }}>
                <select 
                  value={u.role} 
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  style={{ padding: '4px 8px' }}
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 16, textAlign: 'center' }}>No users found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
