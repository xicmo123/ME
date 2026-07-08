"use client";

import { useEffect, useState } from "react";
import { Trash2, Eye, UserX, Plus, Pencil, X, ChevronLeft } from "lucide-react";

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
  const [accountForm, setAccountForm] = useState({
    name: "", type: "ASSET", category: "CASH", symbol: "",
    quantity: "", currentPrice: "1", currentValue: "", currency: "TWD",
  });

  const inputClass = "w-full h-10 px-3 text-sm border border-black/15 dark:border-white/15 bg-transparent rounded-sm focus:outline-none focus:border-black/40 dark:focus:border-white/40";
  const btnPrimary = "px-4 py-2 text-sm font-semibold bg-[#1C1F1A] text-white rounded-sm hover:opacity-90 transition-all cursor-pointer";
  const btnDanger = "px-4 py-2 text-sm font-semibold bg-rose-600 text-white rounded-sm hover:opacity-90 transition-all cursor-pointer";

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

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF0EC] dark:bg-[#0B0D12]">
      <p className="text-rose-600 font-semibold text-lg">{error}</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#EEF0EC] dark:bg-[#0B0D12] text-[#1C1F1A] dark:text-[#E7E5DE] p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-[#1C1F1A] dark:border-[#B8933C]">
          <div>
            <h1 className="text-2xl font-bold">管理後台</h1>
            <p className="text-sm text-[#6B7066] dark:text-[#8A8F82] mt-1">Admin Dashboard</p>
          </div>
          <a href="/" className="flex items-center gap-2 text-sm text-[#6B7066] hover:text-[#1C1F1A] dark:hover:text-white transition-colors">
            <ChevronLeft className="h-4 w-4" /> 返回主頁
          </a>
        </div>

        {/* 用戶列表 */}
        {!selectedUser && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">用戶列表</h2>
              <span className="text-sm text-[#6B7066] dark:text-[#8A8F82]">共 {users.length} 個用戶</span>
            </div>
            {loading ? (
              <p className="text-[#6B7066]">載入中...</p>
            ) : (
              <div className="space-y-3">
                {users.map(user => (
                  <div key={user.id} className="bg-white dark:bg-[#12151C] border border-black/[0.08] dark:border-white/[0.08] rounded-sm p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">{user.email}</p>
                      <p className="text-xs text-[#6B7066] dark:text-[#8A8F82] mt-1 font-mono">
                        ID: {user.id} · 資產 {user._count.accounts} 筆 · 歷史 {user._count.history} 筆
                      </p>
                      <p className="text-xs text-[#6B7066] dark:text-[#8A8F82]">
                        建立於 {new Date(user.createdAt).toLocaleString("zh-TW")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => fetchUser(user.id)} className={btnPrimary}>
                        <Eye className="h-4 w-4 inline mr-1" /> 查看
                      </button>
                      <button onClick={() => handleDisableUser(user.id)} className="px-3 py-2 text-sm font-semibold border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-sm hover:bg-amber-500/10 transition-all cursor-pointer">
                        <UserX className="h-4 w-4 inline mr-1" /> 停用
                      </button>
                      <button onClick={() => handleDeleteUser(user.id, user.email)} className={btnDanger}>
                        <Trash2 className="h-4 w-4 inline mr-1" /> 刪除
                      </button>
                    </div>
                  </div>
                ))}
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

            <div className="bg-white dark:bg-[#12151C] border border-black/[0.08] dark:border-white/[0.08] rounded-sm p-6 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedUser.email}</h2>
                  <p className="text-xs font-mono text-[#6B7066] dark:text-[#8A8F82] mt-1">ID: {selectedUser.id}</p>
                  <p className="text-sm text-[#6B7066] dark:text-[#8A8F82] mt-1">
                    建立於 {new Date(selectedUser.createdAt).toLocaleString("zh-TW")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleDisableUser(selectedUser.id)} className="px-3 py-2 text-sm font-semibold border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-sm hover:bg-amber-500/10 transition-all cursor-pointer">
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
                <Plus className="h-4 w-4 inline mr-1" /> 新增資產
              </button>
            </div>

            <div className="space-y-2">
              {selectedUser.accounts?.map((account: any) => (
                <div key={account.id} className="bg-white dark:bg-[#12151C] border border-black/[0.08] dark:border-white/[0.08] rounded-sm p-4 flex items-center justify-between gap-4">
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
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => startEdit(account)} className="p-2 text-[#6B7066] hover:text-[#B8933C] transition-colors">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDeleteAccount(account.id)} className="p-2 text-[#6B7066] hover:text-rose-500 transition-colors">
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