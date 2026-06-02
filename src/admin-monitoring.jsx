const {
  useEffect: useAdminMonitoringEffect,
  useState: useAdminMonitoringState,
} = React;

const ADMIN_MONITORING_ACCESS_TYPES = [
  ['tryout', 'Try Out', 'tryout-premium-tpb-prep'],
  ['mission', 'Misi Harian', 'daily-missions'],
];

function adminMonitoringAccessValueForType(type) {
  const match = ADMIN_MONITORING_ACCESS_TYPES.find(([id]) => id === type);
  return match ? match[2] : '';
}

function adminMonitoringAccessLabel(grant) {
  if (!grant) return '';
  const match = ADMIN_MONITORING_ACCESS_TYPES.find(
    ([id, _label, value]) => id === grant.access_type && value === grant.access_value
  );
  return match ? match[1] : grant.access_type + ': ' + grant.access_value;
}

function adminMonitoringToast(message, type) {
  if (typeof showToast === 'function') showToast(message, type || 'info');
}

function adminMonitoringNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value) || 0);
}

function adminMonitoringPercent(value, max) {
  const numerator = Math.max(0, Number(value) || 0);
  const denominator = Math.max(1, Number(max) || 1);
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function AdminMonitoringProgressBar({ label, used, limit, tone }) {
  const percent = adminMonitoringPercent(used, limit);
  const color = tone === 'token' ? '#2563eb' : '#ea580c';
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-ink/55 mb-1">
        <span>{label}</span>
        <span className="tnum">{percent}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(11,19,38,.08)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: percent + '%', background: color }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-ink/45 mt-1">
        <span className="tnum">{adminMonitoringNumber(used)}</span>
        <span className="tnum">{adminMonitoringNumber(limit)}</span>
      </div>
    </div>
  );
}

function AdminMonitoringAccessBadges({ grants }) {
  if (!grants || !grants.length) {
    return <span className="text-xs text-ink/40">Belum ada akses manual</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {grants.slice(0, 4).map((grant) => (
        <span key={grant.id} className="tag">
          {adminMonitoringAccessLabel(grant)}
        </span>
      ))}
      {grants.length > 4 && <span className="tag">+{grants.length - 4}</span>}
    </div>
  );
}

function AdminMonitoringKeyCard({ item }) {
  const requestPercent = adminMonitoringPercent(item.requestsToday, item.requestDailyLimit);
  const tokenPercent = adminMonitoringPercent(item.tokensToday, item.tokenDailyLimit);
  const isBusy = requestPercent >= 85 || tokenPercent >= 85;
  return (
    <div
      className="rounded-lg p-3"
      style={{
        border: '1px solid rgba(11,19,38,.08)',
        background: item.configured ? 'white' : 'rgba(11,19,38,.025)',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="font-semibold text-sm">{item.keyName}</div>
          <div className="text-[11px] text-ink/45">{item.configured ? 'Aktif di server' : 'Belum diset'}</div>
        </div>
        <span className={'tag' + (isBusy ? ' tag-danger' : item.configured ? ' tag-ink' : '')}>
          {isBusy ? 'Tinggi' : item.configured ? 'Siap' : 'Kosong'}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <AdminMonitoringProgressBar
          label="RPD"
          used={item.requestsToday}
          limit={item.requestDailyLimit}
          tone="request"
        />
        <AdminMonitoringProgressBar
          label="Token"
          used={item.tokensToday}
          limit={item.tokenDailyLimit}
          tone="token"
        />
      </div>
    </div>
  );
}

const AdminMonitoringPanel = () => {
  const [data, setData] = useAdminMonitoringState(null);
  const [error, setError] = useAdminMonitoringState('');
  const [loading, setLoading] = useAdminMonitoringState(true);
  const [busyUserId, setBusyUserId] = useAdminMonitoringState(null);
  const [grantDrafts, setGrantDrafts] = useAdminMonitoringState({});

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      const response = await MafikingAPI.get('/api/admin/dashboard-data');
      setData(response);
    } catch (e) {
      setError(e.message || 'Gagal memuat dashboard admin.');
    } finally {
      setLoading(false);
    }
  }

  useAdminMonitoringEffect(() => {
    loadDashboard();
  }, []);

  function readGrantDraft(userId) {
    return grantDrafts[userId] || { access_type: 'tryout', revoke_grant_id: '' };
  }

  function patchGrantDraft(userId, patch) {
    setGrantDrafts((current) => ({
      ...current,
      [userId]: { ...(current[userId] || { access_type: 'tryout', revoke_grant_id: '' }), ...patch },
    }));
  }

  async function resetPassword(user) {
    if (!window.confirm('Reset password ' + user.display_name + ' menjadi 123456?')) return;
    setBusyUserId(user.id);
    try {
      const response = await MafikingAPI.post('/api/admin/users/' + user.id + '/reset-password');
      adminMonitoringToast('Password ' + user.display_name + ' direset ke ' + response.temporaryPassword + '.', 'success');
    } catch (e) {
      adminMonitoringToast(e.message || 'Gagal reset password.', 'error');
    } finally {
      setBusyUserId(null);
    }
  }

  async function grantAccess(user) {
    const draft = readGrantDraft(user.id);
    const accessValue = adminMonitoringAccessValueForType(draft.access_type);
    if (!accessValue) {
      adminMonitoringToast('Pilihan akses tidak valid.', 'error');
      return;
    }
    setBusyUserId(user.id);
    try {
      await MafikingAPI.post('/api/admin/users/' + user.id + '/grant-access', {
        access_type: draft.access_type,
        access_value: accessValue,
      });
      adminMonitoringToast('Akses diberikan untuk ' + user.display_name + '.', 'success');
      await loadDashboard();
    } catch (e) {
      adminMonitoringToast(e.message || 'Gagal memberi akses.', 'error');
    } finally {
      setBusyUserId(null);
    }
  }

  async function revokeAccess(user, grantId) {
    const normalizedGrantId = String(grantId || '').trim();
    if (!normalizedGrantId) {
      adminMonitoringToast('Pilih akses yang ingin dicabut.', 'error');
      return;
    }
    const grant = (user.access_grants || []).find((item) => String(item.id) === normalizedGrantId);
    if (!grant) {
      adminMonitoringToast('Akses user tidak ditemukan.', 'error');
      return;
    }
    setBusyUserId(user.id);
    try {
      await MafikingAPI.del('/api/admin/users/' + user.id + '/access-grants/' + normalizedGrantId);
      adminMonitoringToast('Akses ' + adminMonitoringAccessLabel(grant) + ' dicabut dari ' + user.display_name + '.', 'success');
      await loadDashboard();
    } catch (e) {
      adminMonitoringToast(e.message || 'Gagal mencabut akses.', 'error');
    } finally {
      setBusyUserId(null);
    }
  }

  async function updateUserRole(user, role) {
    const label = role === 'admin' ? 'memberi akses Admin Panel ke ' : 'mencabut akses Admin Panel dari ';
    if (!window.confirm(label + user.display_name + '?')) return;
    setBusyUserId(user.id);
    try {
      await MafikingAPI.post('/api/admin/users/' + user.id + '/role', { role });
      adminMonitoringToast('Role ' + user.display_name + ' diubah menjadi ' + role + '.', 'success');
      await loadDashboard();
    } catch (e) {
      adminMonitoringToast(e.message || 'Gagal mengubah role.', 'error');
    } finally {
      setBusyUserId(null);
    }
  }

  async function deleteUser(user) {
    if (data?.currentUserId === user.id) {
      adminMonitoringToast('Tidak bisa menghapus akun sendiri.', 'error');
      return;
    }
    if (user.role === 'admin') {
      adminMonitoringToast('Akun admin tidak bisa dihapus dari panel ini.', 'error');
      return;
    }
    if (!window.confirm('Hapus user ' + user.display_name + '? Aksi ini tidak bisa dibatalkan.')) return;
    setBusyUserId(user.id);
    try {
      await MafikingAPI.del('/api/admin/users/' + user.id);
      adminMonitoringToast('User ' + user.display_name + ' dihapus.', 'success');
      await loadDashboard();
    } catch (e) {
      adminMonitoringToast(e.message || 'Gagal menghapus user.', 'error');
    } finally {
      setBusyUserId(null);
    }
  }

  if (loading) {
    return <div className="flex flex-col gap-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  if (error) {
    return (
      <div className="admin-step-edit">
        <div className="font-semibold mb-2">Dashboard monitoring gagal dimuat</div>
        <p className="text-sm text-ink/60 mb-3">{error}</p>
        <button className="admin-btn-primary" type="button" onClick={loadDashboard}>Muat Ulang</button>
      </div>
    );
  }

  const users = data?.users || [];
  const geminiKeys = data?.geminiKeys || [];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="admin-pane-header">
          <div>
            <span className="kicker">User Data & Access Control</span>
            <div className="text-xs text-ink/45 mt-1">{users.length} user terpantau</div>
          </div>
          <button className="admin-btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }} type="button" onClick={loadDashboard}>Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>XP</th>
                <th>Progress</th>
                <th>Koreksi AI</th>
                <th>Akses</th>
                <th>Kelola Akses</th>
                <th>Admin Panel</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const draft = readGrantDraft(user.id);
                const userGrants = Array.isArray(user.access_grants) ? user.access_grants : [];
                const selectedRevokeGrantId = userGrants.some((grant) => String(grant.id) === String(draft.revoke_grant_id))
                  ? String(draft.revoke_grant_id)
                  : (userGrants[0] ? String(userGrants[0].id) : '');
                return (
                  <tr key={user.id} className={user.role === 'admin' ? 'admin-row-admin' : ''}>
                    <td>
                      <div className="font-semibold">{user.display_name}</div>
                      <div className="text-xs text-ink/45">{user.username}</div>
                    </td>
                    <td><span className={'tag' + (user.role === 'admin' ? ' tag-ink' : '')}>{user.role}</span></td>
                    <td className="tnum">
                      <div>{adminMonitoringNumber(user.xp)}</div>
                      <div className="text-[11px] text-ink/45">Lv {user.level}</div>
                    </td>
                    <td className="tnum text-xs">
                      <div>{adminMonitoringNumber(user.progress?.solved)} selesai</div>
                      <div className="text-ink/45">{adminMonitoringNumber(user.practice?.attempts)} latihan</div>
                    </td>
                    <td className="tnum text-xs">
                      <div>{adminMonitoringNumber(user.corrections?.count)} request</div>
                      <div className="text-ink/45">Avg {user.corrections?.averageScore ?? '-'}</div>
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <AdminMonitoringAccessBadges grants={user.access_grants} />
                    </td>
                    <td style={{ minWidth: 430 }}>
                      <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex gap-2 items-center">
                          <select
                            className="admin-input"
                            style={{ minWidth: 130 }}
                            value={draft.access_type}
                            onChange={(event) => patchGrantDraft(user.id, { access_type: event.target.value })}
                          >
                            {ADMIN_MONITORING_ACCESS_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                          </select>
                          <button
                            className="admin-btn-primary"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            disabled={busyUserId === user.id}
                            onClick={() => grantAccess(user)}
                            type="button"
                          >
                            Beri
                          </button>
                        </div>
                        <div className="flex gap-2 items-center">
                          <select
                            className="admin-input"
                            style={{ minWidth: 150 }}
                            value={selectedRevokeGrantId}
                            disabled={!userGrants.length || busyUserId === user.id}
                            onChange={(event) => patchGrantDraft(user.id, { revoke_grant_id: event.target.value })}
                          >
                            {userGrants.length
                              ? userGrants.map((grant) => (
                                <option key={grant.id} value={grant.id}>{adminMonitoringAccessLabel(grant)}</option>
                              ))
                              : <option value="">Belum ada akses</option>}
                          </select>
                          <button
                            className="admin-btn-ghost"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            disabled={!userGrants.length || busyUserId === user.id}
                            onClick={() => revokeAccess(user, selectedRevokeGrantId)}
                            type="button"
                          >
                            Cabut
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button
                        className={user.role === 'admin' ? 'admin-btn-ghost' : 'admin-btn-primary'}
                        style={{ padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' }}
                        disabled={busyUserId === user.id || (data?.currentUserId === user.id && user.role === 'admin')}
                        onClick={() => updateUserRole(user, user.role === 'admin' ? 'user' : 'admin')}
                        type="button"
                      >
                        {user.role === 'admin' ? 'Jadikan User' : 'Jadikan Admin'}
                      </button>
                    </td>
                    <td>
                      <button
                        className="admin-btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        disabled={busyUserId === user.id}
                        onClick={() => resetPassword(user)}
                        type="button"
                      >
                        Reset Sandi
                      </button>
                      <button
                        className="admin-btn-danger"
                        style={{ padding: '4px 10px', fontSize: 12, marginLeft: 6 }}
                        disabled={busyUserId === user.id || data?.currentUserId === user.id || user.role === 'admin'}
                        onClick={() => deleteUser(user)}
                        type="button"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="admin-pane-header">
          <div>
            <span className="kicker">AI Token Monitoring</span>
            <div className="text-xs text-ink/45 mt-1">Limit aman harian: 1.500 request dan 1.000.000 token per key</div>
          </div>
          <span className="text-xs text-ink/45">Update {data?.generatedAt ? new Date(data.generatedAt).toLocaleString('id-ID') : '-'}</span>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {geminiKeys.map((item) => <AdminMonitoringKeyCard key={item.keyName} item={item} />)}
        </div>
      </section>
    </div>
  );
};

window.AdminMonitoringPanel = AdminMonitoringPanel;
