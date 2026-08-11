"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, Eye, UserX, Plus, Pencil, X, ChevronLeft, Search, MoreHorizontal, Users, Crown, Activity, Database, ShieldAlert } from "lucide-react";

const categoryLabelMap: Record<string, string> = {
  CASH: "現金", BANK_ACCOUNT: "銀行帳戶", TAIWAN_STOCK: "台股",
  US_STOCK: "美股", CRYPTO: "虛擬貨幣", FIXED_ASSET: "固定資產",
  RECEIVABLE: "應收款", PAYABLE: "應付款", MORTGAGE: "房貸",
  CAR_LOAN: "車貸", CREDIT_LOAN: "信用貸款",
};

const typeOptions = [{ value: "ASSET", label: "資產" }, { value: "LIABILITY", label: "負債" }];
const categoryOptions = Object.entries(categoryLabelMap).map(([value, label]) => ({ value, label }));
const currencyOptions = [{ value: "TWD", label: "TWD" }, { value: "USD", label: "USD" }];

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"ALL" | "FREE" | "PRO">("ALL");
  const [actionMenuUserId, setActionMenuUserId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({
    name: "", type: "ASSET", category: "CASH", symbol: "",
    quantity: "", currentPrice: "1", currentValue: "", currency: "TWD",
  });

  const inputClass = "w-full h-10 px-3 text-sm border border-black/15 dark:border-white/15 bg-transparent rounded-lg focus:outline-none focus:border-[#B8933C] dark:focus:border-[#B8933C]";
  const btnPrimary = "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold bg-[#1C1F1A] text-white rounded-lg hover:opacity-90 transition-all cursor-pointer";
  const btnDanger = "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold bg-rose-600 text-white rounded-lg hover:opacity-90 transition-all cursor-pointer";
  const surface = "bg-white dark:bg-[#12151C] border border-black/[0.08] dark:border-white/[0.08] shadow-[0_10px_30px_-18px_rgba(28,31,26,0.18)]";

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin?action=users");
      if (res.status === 403) { setError("無管理員權限"); return; }
      const data = await res.json();
      setUsers(data);
    } catch { setError("載入失敗"); }
    finally { setLoading(false); }
  }

  async function fetchUser(userId: string) {
    const res = await fetch(`/api/admin?action=user&userId=${userId}`);
    const data = await res.json();
    setSelectedUser(data);
  }

  async function handleSetSubscription(userId: string, tier: "FREE" | "PRO") {
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setSubscription", targetUserId: userId, data: { tier } }),
    });
    await fetchUsers();
    if (selectedUser?.id === userId) await fetchUser(userId);
  }

  async function handleDisableUser(userId: string) {
    if (!confirm("確定要停用這個用戶的所有資產嗎？")) return;
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disableUser", targetUserId: userId }),
    });
    await fetchUsers();
    setSelectedUser(null);
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`確定要永久刪除用戶 ${email} 及其所有資料嗎？此操作無法復原！`)) return;
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteUser", targetUserId: userId }),
    });
    await fetchUsers();
    setSelectedUser(null);
  }

  async function handleDeleteAccount(accountId: string) {
    if (!confirm("確定要刪除這筆資產嗎？")) return;
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteAccount", accountId }),
    });
    if (selectedUser) await fetchUser(selectedUser.id);
  }

  async function handleSubmitAccount(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(accountForm.quantity || 0);
    const currentPrice = Number(accountForm.currentPrice || 1);
    const currentValue = Number(accountForm.currentValue || quantity);

    if (editingAccount) {
      await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateAccount",
          accountId: editingAccount.id,
          data: { name: accountForm.name, quantity, currentPrice, currentValue },
        }),
      });
    } else {
      await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createAccount",
          targetUserId: selectedUser.id,
          data: { ...accountForm, quantity, currentPrice, currentValue },
        }),
      });
    }

    setShowAddAccount(false);
    setEditingAccount(null);
    setAccountForm({ name: "", type: "ASSET", category: "CASH", symbol: "", quantity: "", currentPrice: "1", currentValue: "", currency: "TWD" });
    if (selectedUser) await fetchUser(selectedUser.id);
  }

  function startEdit(account: any) {
    setAccountForm({
      name: account.name, type: account.type, category: account.category,
      symbol: account.symbol || "", quantity: String(account.quantity || 0),
      currentPrice: String(account.currentPrice || 1),
      currentValue: String(account.currentValue || 0),
      currency: account.currency,
    });
    setEditingAccount(account);
    setShowAddAccount(true);
  }

  function formatCurrency(v: number) {
    return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  const adminStats = {
    totalUsers: users.length,
    proUsers: users.filter((u) => u.subscriptionTier === "PRO").length,
    freeUsers: users.filter((u) => u.subscriptionTier !== "PRO").length,
    totalAccounts: users.reduce((sum, u) => sum + (u._count?.accounts ?? 0), 0),
    totalHistory: users.reduce((sum, u) => sum + (u._count?.history ?? 0), 0),
    newThisWeek: users.filter((u) => Date.now() - new Date(u.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000).length,
  };

  const filteredUsers = users.filter((user) => {
    const q = userSearch.trim().toLowerCase();
    const matchesQuery = !q || user.email.toLowerCase().includes(q) || user.id.toLowerCase().includes(q);
    const matchesTier = tierFilter === "ALL" || user.subscriptionTier === tierFilter;
    return matchesQuery && matchesTier;
  });

  const proRate = adminStats.totalUsers ? Math.round((adminStats.proUsers / adminStats.totalUsers) * 100) : 0;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF0EC] dark:bg-[#0B0D12]">
      <p className="text-rose-600 font-semibold text-lg">{error}</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#EEF0EC] dark:bg-[#0B0D12] text-brand-ink dark:text-brand-paper px-4 py-5 sm:p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6 pb-4 border-b-2 border-[#1C1F1A] dark:border-[#B8933C]">
          <div>
            <h1 className="text-2xl font-bold">管理後台</h1>
            <p className="text-sm text-[#6B7066] dark:text-[#8A8F82] mt-1">營運狀態、用戶方案與資料風險</p>
          </div>
          <Link href="/" className="flex w-fit items-center gap-2 text-sm text-[#6B7066] hover:text-[#1C1F1A] dark:hover:text-white transition-colors">
            <ChevronLeft className="h-4 w-4" /> 返回主頁
          </Link>
        </div>

        {/* 用戶列表 */}
        {!selectedUser && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                { label: "總用戶", value: adminStats.totalUsers, note: `本週 +${adminStats.newThisWeek}`, icon: Users },
                { label: "Pro 用戶", value: adminStats.proUsers, note: `轉換率 ${proRate}%`, icon: Crown },
                { label: "Free 用戶", value: adminStats.freeUsers, note: "可轉換名單", icon: Activity },
                { label: "帳戶資料", value: adminStats.totalAccounts, note: "資產/負債筆數", icon: Database },
                { label: "歷史紀錄", value: adminStats.totalHistory, note: "淨值快照", icon: ShieldAlert },
              ].map(({ label, value, note, icon: Icon }) => (
                <div key={label} className={`${surface} rounded-2xl p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold tracking-[0.16em] uppercase text-[#6B7066] dark:text-[#8A8F82]">{label}</p>
                    <Icon className="h-4 w-4 text-[#B8933C]" />
                  </div>
                  <p className="mt-3 font-mono text-2xl font-bold">{value.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-[#6B7066] dark:text-[#8A8F82]">{note}</p>
                </div>
              ))}
            </div>

            <div className={`${surface} rounded-2xl p-4`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold">用戶列表</h2>
                  <p className="text-sm text-[#6B7066] dark:text-[#8A8F82]">共 {filteredUsers.length} / {users.length} 個用戶</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7066]" />
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="搜尋 email 或 user id"
                      className="h-10 w-full rounded-lg border border-black/10 bg-transparent pl-9 pr-3 text-sm outline-none focus:border-[#B8933C] dark:border-white/10"
                    />
                  </div>
                  <div className="flex rounded-lg bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                    {(["ALL", "PRO", "FREE"] as const).map((tier) => (
                      <button
                        key={tier}
                        onClick={() => setTierFilter(tier)}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${tierFilter === tier ? "bg-white text-[#B8933C] shadow-sm dark:bg-[#151923]" : "text-[#6B7066] dark:text-[#8A8F82]"}`}
                      >
                        {tier === "ALL" ? "全部" : tier}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {loading ? (
              <div className={`${surface} rounded-2xl p-5 text-[#6B7066]`}>載入中...</div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map(user => (
                  <div key={user.id} className={`${surface} rounded-2xl p-4 sm:p-5`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 truncate font-semibold">{user.email}</p>
                          <span className={`shrink-0 text-xs font-bold tracking-wider uppercase px-2 py-0.5 rounded ${user.subscriptionTier === "PRO" ? "bg-[#B8933C]/15 text-[#B8933C]" : "bg-black/5 dark:bg-white/10 text-[#6B7066] dark:text-[#8A8F82]"}`}>
                            {user.subscriptionTier === "PRO" ? "PRO" : "FREE"}
                          </span>
                        </div>
                        <p className="mt-1 break-all text-xs text-[#6B7066] dark:text-[#8A8F82] font-mono">
                          ID: {user.id}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#6B7066] dark:text-[#8A8F82]">
                          <span className="rounded-full bg-black/[0.04] px-2 py-1 dark:bg-white/[0.06]">資產 {user._count.accounts} 筆</span>
                          <span className="rounded-full bg-black/[0.04] px-2 py-1 dark:bg-white/[0.06]">歷史 {user._count.history} 筆</span>
                          <span className="rounded-full bg-black/[0.04] px-2 py-1 dark:bg-white/[0.06]">建立於 {new Date(user.createdAt).toLocaleDateString("zh-TW")}</span>
                        </div>
                      </div>
                      <div className="relative flex items-center gap-2 self-stretch lg:self-auto">
                        <button onClick={() => fetchUser(user.id)} className={`${btnPrimary} flex-1 lg:flex-none`}>
                          <Eye className="h-4 w-4" /> 查看
                        </button>
                        <button
                          onClick={() => handleSetSubscription(user.id, user.subscriptionTier === "PRO" ? "FREE" : "PRO")}
                          className="inline-flex flex-1 items-center justify-center rounded-lg border border-[#B8933C]/40 px-3 py-2 text-sm font-semibold text-[#B8933C] transition-all hover:bg-[#B8933C]/10 lg:flex-none"
                        >
                          {user.subscriptionTier === "PRO" ? "降為 FREE" : "升級為 PRO"}
                        </button>
                        <button
                          onClick={() => setActionMenuUserId(actionMenuUserId === user.id ? null : user.id)}
                          aria-label="更多操作"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-black/10 text-[#6B7066] transition-colors hover:text-[#1C1F1A] dark:border-white/10 dark:hover:text-white"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {actionMenuUserId === user.id && (
                          <div className="absolute right-0 top-12 z-20 w-44 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#151923]">
                            <button onClick={() => { setActionMenuUserId(null); handleDisableUser(user.id); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-amber-600 hover:bg-amber-500/10 dark:text-amber-400">
                              <UserX className="h-4 w-4" /> 停用用戶
                            </button>
                            <button onClick={() => { setActionMenuUserId(null); handleDeleteUser(user.id, user.email); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-rose-600 hover:bg-rose-500/10">
                              <Trash2 className="h-4 w-4" /> 永久刪除
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <div className={`${surface} rounded-2xl p-8 text-center text-sm text-[#6B7066] dark:text-[#8A8F82]`}>
                    找不到符合條件的用戶
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 用戶詳細資料 */}
        {selectedUser && (
          <div>
            <button onClick={() => setSelectedUser(null)} className="flex items-center gap-2 text-sm text-[#6B7066] hover:text-[#1C1F1A] dark:hover:text-white mb-6 transition-colors">
              <ChevronLeft className="h-4 w-4" /> 返回用戶列表
            </button>

            <div className={`${surface} rounded-2xl p-5 sm:p-6 mb-6`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="min-w-0 break-all text-xl font-bold">{selectedUser.email}</h2>
                    <span className={`text-xs font-bold tracking-wider uppercase px-2 py-0.5 rounded ${selectedUser.subscriptionTier === "PRO" ? "bg-[#B8933C]/15 text-[#B8933C]" : "bg-black/5 dark:bg-white/10 text-[#6B7066] dark:text-[#8A8F82]"}`}>
                      {selectedUser.subscriptionTier === "PRO" ? "PRO" : "FREE"}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-[#6B7066] dark:text-[#8A8F82] mt-1 break-all">ID: {selectedUser.id}</p>
                  <p className="text-sm text-[#6B7066] dark:text-[#8A8F82] mt-1">
                    建立於 {new Date(selectedUser.createdAt).toLocaleString("zh-TW")}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div className="rounded-xl bg-black/[0.04] p-3 dark:bg-white/[0.06]">
                      <p className="text-xs text-[#6B7066] dark:text-[#8A8F82]">資產筆數</p>
                      <p className="mt-1 font-mono text-lg font-bold">{selectedUser.accounts?.length || 0}</p>
                    </div>
                    <div className="rounded-xl bg-black/[0.04] p-3 dark:bg-white/[0.06]">
                      <p className="text-xs text-[#6B7066] dark:text-[#8A8F82]">總資產值</p>
                      <p className="mt-1 font-mono text-lg font-bold">
                        NT$ {formatCurrency((selectedUser.accounts || []).filter((a: any) => a.type === "ASSET").reduce((sum: number, a: any) => sum + Number(a.currentValue || 0), 0))}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/[0.04] p-3 dark:bg-white/[0.06]">
                      <p className="text-xs text-[#6B7066] dark:text-[#8A8F82]">負債值</p>
                      <p className="mt-1 font-mono text-lg font-bold text-rose-600">
                        NT$ {formatCurrency((selectedUser.accounts || []).filter((a: any) => a.type === "LIABILITY").reduce((sum: number, a: any) => sum + Number(a.currentValue || 0), 0))}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
                  <button
                    onClick={() => handleSetSubscription(selectedUser.id, selectedUser.subscriptionTier === "PRO" ? "FREE" : "PRO")}
                    className="px-3 py-2 text-sm font-semibold border border-[#B8933C]/40 text-[#B8933C] rounded-lg hover:bg-[#B8933C]/10 transition-all cursor-pointer"
                  >
                    {selectedUser.subscriptionTier === "PRO" ? "降為 FREE" : "升級為 PRO"}
                  </button>
                  <button onClick={() => handleDisableUser(selectedUser.id)} className="px-3 py-2 text-sm font-semibold border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-lg hover:bg-amber-500/10 transition-all cursor-pointer">
                    停用用戶
                  </button>
                  <button onClick={() => handleDeleteUser(selectedUser.id, selectedUser.email)} className={btnDanger}>
                    刪除用戶
                  </button>
                </div>
              </div>
            </div>

            {/* 資產列表 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">資產明細（{selectedUser.accounts?.length || 0} 筆）</h3>
              <button onClick={() => { setShowAddAccount(true); setEditingAccount(null); }} className={btnPrimary}>
                <Plus className="h-4 w-4" /> 新增資產
              </button>
            </div>

            <div className="space-y-2">
              {selectedUser.accounts?.map((account: any) => (
                <div key={account.id} className={`${surface} rounded-2xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{account.name}</span>
                      {account.symbol && <span className="font-mono text-xs bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">{account.symbol}</span>}
                      <span className="text-xs px-2 py-0.5 bg-black/5 dark:bg-white/5 rounded">{categoryLabelMap[account.category]}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${account.type === "ASSET" ? "text-green-700 bg-green-500/10" : "text-rose-700 bg-rose-500/10"}`}>
                        {account.type === "ASSET" ? "資產" : "負債"}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-[#6B7066] dark:text-[#8A8F82] mt-1">
                      數量: {formatCurrency(account.quantity)} · 單價: {formatCurrency(account.currentPrice)} · 總值: NT$ {formatCurrency(account.currentValue)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button onClick={() => startEdit(account)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 text-[#6B7066] hover:text-[#B8933C] transition-colors dark:border-white/10">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDeleteAccount(account.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 text-[#6B7066] hover:text-rose-500 transition-colors dark:border-white/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 新增/編輯資產 Modal */}
        {showAddAccount && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md bg-white dark:bg-[#12151C] border border-black/10 dark:border-white/10 rounded-sm shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-black/10 dark:border-white/10">
                <h3 className="font-bold">{editingAccount ? "編輯資產" : "新增資產"}</h3>
                <button onClick={() => { setShowAddAccount(false); setEditingAccount(null); }} className="p-2 text-[#6B7066] hover:text-[#1C1F1A] dark:hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleSubmitAccount} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold tracking-wider uppercase text-[#6B7066] mb-1.5">名稱</label>
                  <input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} className={inputClass} required />
                </div>
                {!editingAccount && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold tracking-wider uppercase text-[#6B7066] mb-1.5">類型</label>
                        <select value={accountForm.type} onChange={e => setAccountForm({ ...accountForm, type: e.target.value })} className={inputClass}>
                          {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold tracking-wider uppercase text-[#6B7066] mb-1.5">類別</label>
                        <select value={accountForm.category} onChange={e => setAccountForm({ ...accountForm, category: e.target.value })} className={inputClass}>
                          {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold tracking-wider uppercase text-[#6B7066] mb-1.5">幣別</label>
                        <select value={accountForm.currency} onChange={e => setAccountForm({ ...accountForm, currency: e.target.value })} className={inputClass}>
                          {currencyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold tracking-wider uppercase text-[#6B7066] mb-1.5">代號 (選填)</label>
                        <input value={accountForm.symbol} onChange={e => setAccountForm({ ...accountForm, symbol: e.target.value })} placeholder="例如：2330.TW" className={inputClass} />
                      </div>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold tracking-wider uppercase text-[#6B7066] mb-1.5">數量 / 金額</label>
                    <input type="number" step="any" value={accountForm.quantity} onChange={e => setAccountForm({ ...accountForm, quantity: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold tracking-wider uppercase text-[#6B7066] mb-1.5">單價</label>
                    <input type="number" step="any" value={accountForm.currentPrice} onChange={e => setAccountForm({ ...accountForm, currentPrice: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold tracking-wider uppercase text-[#6B7066] mb-1.5">總價值 (NT$，留空自動計算)</label>
                  <input type="number" step="any" value={accountForm.currentValue} onChange={e => setAccountForm({ ...accountForm, currentValue: e.target.value })} placeholder="留空 = 數量 × 單價" className={`${inputClass} font-mono`} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setShowAddAccount(false); setEditingAccount(null); }} className="px-4 py-2 text-sm text-[#6B7066] hover:text-[#1C1F1A] cursor-pointer">取消</button>
                  <button type="submit" className={btnPrimary}>確認儲存</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
