import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, Check, Trash2, Plus, RefreshCw, Lock, Gift, Calendar,
  Key, Users, ChevronDown, ChevronUp, Clock, Send, UserX, CalendarClock,
} from "lucide-react";
import { useLang } from "@/contexts/lang";

const PASS_KEY = "enawi_admin_pass";

const MAX_USES_OPTIONS = [
  { label: "شخص واحد فقط", value: 1 },
  { label: "2 أشخاص", value: 2 },
  { label: "5 أشخاص", value: 5 },
  { label: "10 أشخاص", value: 10 },
  { label: "بدون حد", value: 0 },
];

const UNIT_OPTIONS = [
  { label: "يوم", value: "days" as const },
  { label: "أسبوع", value: "weeks" as const },
  { label: "شهر", value: "months" as const },
];

function daysFromUnit(n: number, unit: "days" | "weeks" | "months"): number {
  if (unit === "weeks") return n * 7;
  if (unit === "months") return n * 30;
  return n;
}

interface GiftEntry {
  code: string;
  label: string;
  createdAt: number;
  usedAt: number | null;
  codeExpiresAt: number | null;
  durationDays: number;
  maxUses: number;
  usedCount: number;
  activeSessions?: number;
  active: boolean;
}
interface GiftsResponse {
  codes: GiftEntry[];
  total: number;
  active: number;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <button onClick={copy} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors">
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
}

function buildSubMessage(code: string, durationDays: number, label?: string): string {
  const dur = (() => {
    if (durationDays % 30 === 0 && durationDays >= 30) return durationDays === 30 ? "شهر" : `${durationDays / 30} أشهر`;
    if (durationDays % 7 === 0 && durationDays >= 7) return durationDays === 7 ? "أسبوع" : `${durationDays / 7} أسابيع`;
    return `${durationDays} يوم`;
  })();
  const greeting = label ? `مرحباً ${label} 🎬` : `مرحباً 🎬`;
  return `${greeting}\nكود اشتراكك في Phoenix Cinema (${dur}):\n\n${code}\n\nافتح الرابط وادخل الكود:\nhttps://enawi.onrender.com`;
}

function TelegramBtn({ code, durationDays, label }: { code: string; durationDays: number; label?: string }) {
  const text = encodeURIComponent(buildSubMessage(code, durationDays, label));
  return (
    <a
      href={`https://t.me/share/url?url=https://enawi.onrender.com&text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      className="p-1.5 rounded-lg hover:bg-[#229ED9]/15 text-muted-foreground/50 hover:text-[#229ED9] transition-colors"
      title="إرسال عبر تيلجرام"
    >
      <Send size={14} />
    </a>
  );
}

function CopyMsgBtn({ code, durationDays, label }: { code: string; durationDays: number; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(buildSubMessage(code, durationDays, label)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      title="نسخ الرسالة كاملة"
      className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground/50 hover:text-white transition-colors"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
}

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `${m}د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}س`;
  return `${Math.floor(h / 24)}ي`;
}

function timeLeft(ms: number) {
  const diff = ms - Date.now();
  if (diff <= 0) return "انتهى";
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}ي`;
  const h = Math.floor(diff / 3600000);
  return `${h}س`;
}

function durationLabel(days: number) {
  if (days % 30 === 0 && days >= 30) return days === 30 ? "شهر" : `${days / 30} أشهر`;
  if (days % 7 === 0 && days >= 7) return days === 7 ? "أسبوع" : `${days / 7} أسابيع`;
  return `${days} يوم`;
}

// Minimum date value for the date input (today)
function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function Admin() {
  const { isAr } = useLang();
  const [pass, setPass] = useState(() => sessionStorage.getItem(PASS_KEY) || "");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");

  const [monthlyCode, setMonthlyCode] = useState<{ code: string; month: string } | null>(null);
  const [gifts, setGifts] = useState<GiftsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Generate form state
  const [genCount, setGenCount] = useState(1);
  const [genLabel, setGenLabel] = useState("");
  const [genDurationNum, setGenDurationNum] = useState(30);
  const [genDurationUnit, setGenDurationUnit] = useState<"days" | "weeks" | "months">("days");
  const [genMaxUses, setGenMaxUses] = useState(1);
  const [genCodeExpiry, setGenCodeExpiry] = useState(""); // date string YYYY-MM-DD
  const [generating, setGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [generatedLabel, setGeneratedLabel] = useState("");

  const [showUsed, setShowUsed] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [revokingCode, setRevokingCode] = useState<string | null>(null);

  const genDuration = daysFromUnit(genDurationNum, genDurationUnit);

  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    return fetch(url, {
      ...opts,
      headers: {
        ...(opts?.headers ?? {}),
        "Authorization": `Bearer ${pass}`,
        ...(opts?.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      },
    });
  }, [pass]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, gRes] = await Promise.all([
        apiFetch("/api/subscription/admin-code"),
        apiFetch("/api/subscription/gifts"),
      ]);
      if (mRes.status === 403 || gRes.status === 403) {
        setAuthError("كلمة المرور غير صحيحة");
        setAuthed(false);
        setLoading(false);
        return;
      }
      if (mRes.ok) setMonthlyCode(await mRes.json());
      if (gRes.ok) setGifts(await gRes.json());
      setAuthed(true);
      sessionStorage.setItem(PASS_KEY, pass);
    } catch {
      setAuthError("خطأ في الاتصال");
    }
    setLoading(false);
  }, [apiFetch, pass]);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    loadData();
  };

  const generateCodes = async () => {
    setGenerating(true);
    setGeneratedCodes([]);
    try {
      const codeExpiresAt = genCodeExpiry
        ? new Date(genCodeExpiry + "T23:59:59").getTime()
        : null;
      const res = await apiFetch("/api/subscription/gifts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: genLabel,
          count: genCount,
          durationDays: genDuration,
          maxUses: genMaxUses,
          codeExpiresAt,
        }),
      });
      const data = await res.json() as { generated: string[] };
      setGeneratedCodes(data.generated);
      setGeneratedLabel(genLabel);
      setGenLabel("");
      setGenCodeExpiry("");
      await loadData();
    } catch {}
    setGenerating(false);
  };

  const deleteCode = async (code: string) => {
    setDeletingCode(code);
    try {
      await apiFetch(`/api/subscription/gifts/${encodeURIComponent(code)}`, { method: "DELETE" });
      await loadData();
    } catch {}
    setDeletingCode(null);
  };

  const revokeSessions = async (code: string) => {
    setRevokingCode(code);
    try {
      await apiFetch(`/api/subscription/gifts/${encodeURIComponent(code)}/revoke-sessions`, { method: "POST" });
      await loadData();
    } catch {}
    setRevokingCode(null);
  };

  useEffect(() => {
    if (pass && sessionStorage.getItem(PASS_KEY) === pass) loadData();
  }, []); // eslint-disable-line

  const activeGifts = gifts?.codes.filter(c => c.active) ?? [];
  const usedGifts = gifts?.codes.filter(c => !c.active) ?? [];

  return (
    <div className="flex-1 pt-28 pb-20 px-4 md:px-8" dir="rtl">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Key size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">لوحة الأدمن</h1>
            <p className="text-sm text-muted-foreground">إدارة الاشتراكات والأكواد</p>
          </div>
        </div>

        {!authed ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-white/[0.04] border border-white/10 p-8 flex flex-col items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Lock size={24} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-white">أدخل كلمة مرور الأدمن</h2>
            <form onSubmit={handleAuth} className="w-full flex flex-col gap-3">
              <input
                type="password"
                value={pass}
                onChange={e => { setPass(e.target.value); setAuthError(""); }}
                placeholder="كلمة المرور"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/30 outline-none focus:border-primary/50 transition-all text-center font-mono"
                dir="ltr"
              />
              {authError && <p className="text-red-400 text-sm text-center">{authError}</p>}
              <button type="submit" disabled={loading}
                className="py-3 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold transition-all flex items-center justify-center gap-2">
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Lock size={16} />}
                دخول
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Key, label: "الكود الشهري", value: monthlyCode?.month?.split(" ")[0] ?? "—" },
                { icon: Gift, label: "هدايا فعّالة", value: String(gifts?.active ?? 0) },
                { icon: Users, label: "إجمالي الأكواد", value: String(gifts?.total ?? 0) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-xl bg-white/[0.04] border border-white/8 p-4 flex flex-col gap-1">
                  <Icon size={14} className="text-primary" />
                  <div className="text-xl font-bold text-white">{value}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
                </div>
              ))}
            </div>

            {/* Monthly code */}
            {monthlyCode && (
              <div className="rounded-2xl border p-5"
                style={{ background: "rgba(220,38,38,0.07)", borderColor: "rgba(220,38,38,0.25)" }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar size={13} />
                    كود {monthlyCode.month} — مشترك لـ 30 يوم
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={`https://t.me/share/url?url=https://enawi.onrender.com&text=${encodeURIComponent(`الكود الشهري لـ Phoenix Cinema:\n\n${monthlyCode.code}\n\nصالح لشهر ${monthlyCode.month}\nhttps://enawi.onrender.com`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-[#229ED9]/15 text-muted-foreground/50 hover:text-[#229ED9] transition-colors"
                    >
                      <Send size={14} />
                    </a>
                    <CopyBtn text={monthlyCode.code} />
                  </div>
                </div>
                <div className="font-mono text-3xl font-bold text-white tracking-widest text-center py-2">
                  {monthlyCode.code}
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  صالح لأي عدد من الأشخاص — يتجدد تلقائياً كل شهر
                </p>
              </div>
            )}

            {/* Generate gift codes */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 space-y-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Gift size={16} className="text-primary" />
                توليد أكواد هدايا
              </h3>

              {/* Label + Count */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={genLabel}
                  onChange={e => setGenLabel(e.target.value)}
                  placeholder="اسم المشترك (اختياري)"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder:text-white/25 outline-none focus:border-primary/40 transition-all"
                />
                <div className="flex items-center gap-1 bg-white/[0.06] border border-white/10 rounded-xl px-2">
                  <button onClick={() => setGenCount(Math.max(1, genCount - 1))} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-white transition-colors text-lg font-bold">−</button>
                  <span className="w-6 text-center text-white text-sm font-mono font-bold">{genCount}</span>
                  <button onClick={() => setGenCount(Math.min(50, genCount + 1))} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-white transition-colors text-lg font-bold">+</button>
                </div>
              </div>

              {/* Duration */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Clock size={11} /> مدة الاشتراك عند تفعيل الكود
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={genDurationNum}
                    onChange={e => setGenDurationNum(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm font-mono outline-none focus:border-primary/40 transition-all text-center"
                    dir="ltr"
                  />
                  <div className="flex gap-1.5 flex-1">
                    {UNIT_OPTIONS.map(u => (
                      <button key={u.value} onClick={() => setGenDurationUnit(u.value)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                          genDurationUnit === u.value
                            ? "bg-primary/20 border-primary/50 text-primary"
                            : "bg-white/[0.04] border-white/10 text-muted-foreground hover:text-white hover:border-white/20"
                        }`}>
                        {u.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-1.5 text-center">= {genDuration} يوم</p>
              </div>

              {/* Max uses */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Users size={11} /> عدد الأشخاص المسموح باستخدام الكود
                </p>
                <div className="flex flex-wrap gap-2">
                  {MAX_USES_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setGenMaxUses(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        genMaxUses === opt.value
                          ? "bg-primary/20 border-primary/50 text-primary"
                          : "bg-white/[0.04] border-white/10 text-muted-foreground hover:text-white hover:border-white/20"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {genMaxUses === 1 && (
                  <p className="text-[11px] text-amber-400/70 mt-1.5 flex items-center gap-1">
                    <span>⚡</span> تسجيل دخول جديد من جهاز آخر سيُلغي الجلسة السابقة
                  </p>
                )}
              </div>

              {/* Code expiry date (optional) */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CalendarClock size={11} /> آخر تاريخ لتفعيل الكود (اختياري)
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={genCodeExpiry}
                    min={todayInputValue()}
                    onChange={e => setGenCodeExpiry(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm outline-none focus:border-primary/40 transition-all"
                    dir="ltr"
                  />
                  {genCodeExpiry && (
                    <button onClick={() => setGenCodeExpiry("")}
                      className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-muted-foreground hover:text-white text-xs transition-colors">
                      إزالة
                    </button>
                  )}
                </div>
                {genCodeExpiry && (
                  <p className="text-[11px] text-amber-400/60 mt-1.5">
                    ⚠ الكود لن يُقبل بعد {new Date(genCodeExpiry).toLocaleDateString("ar")}
                  </p>
                )}
              </div>

              <button onClick={generateCodes} disabled={generating}
                className="w-full px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2">
                {generating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                توليد {genCount > 1 ? `${genCount} أكواد` : "كود"}
              </button>

              {/* Freshly generated */}
              <AnimatePresence>
                {generatedCodes.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-green-500/10 border border-green-500/25 p-4 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-green-400 text-xs font-medium">
                        ✓ {generatedCodes.length} كود — {durationLabel(genDuration)} — {genMaxUses === 0 ? "بدون حد" : `${genMaxUses} شخص`}
                      </p>
                      {generatedLabel && (
                        <span className="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
                          {generatedLabel}
                        </span>
                      )}
                    </div>
                    {generatedCodes.map(code => (
                      <div key={code} className="bg-black/30 rounded-xl overflow-hidden">
                        {/* Code row */}
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <span className="font-mono text-white font-bold tracking-widest text-sm">{code}</span>
                          <div className="flex items-center gap-0.5">
                            <TelegramBtn code={code} durationDays={genDuration} label={generatedLabel || undefined} />
                            <CopyMsgBtn code={code} durationDays={genDuration} label={generatedLabel || undefined} />
                            <CopyBtn text={code} />
                          </div>
                        </div>
                        {/* Preview message */}
                        <div className="px-3 pb-3">
                          <pre className="text-[10px] text-white/40 whitespace-pre-wrap leading-relaxed bg-white/[0.03] rounded-lg px-2.5 py-2 font-sans select-all border border-white/5">
                            {buildSubMessage(code, genDuration, generatedLabel || undefined)}
                          </pre>
                        </div>
                      </div>
                    ))}
                    {generatedCodes.length > 1 && (
                      <button
                        onClick={() => navigator.clipboard.writeText(generatedCodes.join("\n"))}
                        className="w-full mt-1 py-2 text-xs text-green-400 hover:text-green-300 border border-green-500/20 rounded-lg hover:bg-green-500/10 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Copy size={11} /> نسخ كل الأكواد دفعة واحدة
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Active gift codes */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Gift size={15} className="text-primary" />
                  الأكواد الفعّالة
                  {activeGifts.length > 0 && (
                    <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{activeGifts.length}</span>
                  )}
                </h3>
                <button onClick={loadData} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors">
                  <RefreshCw size={13} />
                </button>
              </div>
              {activeGifts.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground/50 text-sm">لا توجد أكواد فعّالة</div>
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {activeGifts.map(entry => {
                    const remaining = entry.maxUses === 0 ? null : entry.maxUses - entry.usedCount;
                    const hasActiveSessions = (entry.activeSessions ?? 0) > 0;
                    return (
                      <div key={entry.code} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-white tracking-wider">{entry.code}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                            <span className="text-[10px] text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-full">{durationLabel(entry.durationDays)}</span>
                            {entry.maxUses > 0 ? (
                              <span className="text-[10px] text-muted-foreground/60 bg-white/5 px-1.5 py-0.5 rounded-full">
                                {entry.usedCount}/{entry.maxUses} مستخدم
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/60 bg-white/5 px-1.5 py-0.5 rounded-full">بدون حد</span>
                            )}
                            {hasActiveSessions && (
                              <span className="text-[10px] text-green-400/70 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                                {entry.activeSessions} نشط
                              </span>
                            )}
                            {entry.codeExpiresAt && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                entry.codeExpiresAt - Date.now() < 3 * 86400000
                                  ? "text-amber-400/80 bg-amber-500/10"
                                  : "text-muted-foreground/50 bg-white/5"
                              }`}>
                                ⏳ {timeLeft(entry.codeExpiresAt)}
                              </span>
                            )}
                          </div>
                          {entry.label && <p className="text-xs text-muted-foreground truncate mt-0.5">{entry.label}</p>}
                          <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                            {timeAgo(entry.createdAt)} — {remaining !== null ? `${remaining} متبقي` : "∞"}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <TelegramBtn code={entry.code} durationDays={entry.durationDays} label={entry.label || undefined} />
                          <CopyMsgBtn code={entry.code} durationDays={entry.durationDays} label={entry.label || undefined} />
                          <CopyBtn text={entry.code} />
                          {hasActiveSessions && (
                            <button
                              onClick={() => revokeSessions(entry.code)}
                              disabled={revokingCode === entry.code}
                              title="طرد جميع المستخدمين النشطين"
                              className="p-1.5 rounded-lg hover:bg-amber-500/15 text-muted-foreground/50 hover:text-amber-400 transition-colors disabled:opacity-40"
                            >
                              {revokingCode === entry.code
                                ? <RefreshCw size={14} className="animate-spin" />
                                : <UserX size={14} />
                              }
                            </button>
                          )}
                          <button
                            onClick={() => deleteCode(entry.code)}
                            disabled={deletingCode === entry.code}
                            className="p-1.5 rounded-lg hover:bg-red-500/15 text-muted-foreground/50 hover:text-red-400 transition-colors disabled:opacity-40"
                          >
                            {deletingCode === entry.code ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Used/exhausted codes */}
            {usedGifts.length > 0 && (
              <div className="rounded-2xl bg-white/[0.02] border border-white/8 overflow-hidden">
                <button onClick={() => setShowUsed(v => !v)}
                  className="w-full px-5 py-4 flex items-center justify-between text-muted-foreground hover:text-white/70 transition-colors">
                  <span className="text-sm flex items-center gap-2">
                    <Users size={14} />
                    الأكواد المستنفدة ({usedGifts.length})
                  </span>
                  {showUsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <AnimatePresence>
                  {showUsed && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                      className="overflow-hidden divide-y divide-white/[0.04]">
                      {usedGifts.map(entry => (
                        <div key={entry.code} className="flex items-center gap-3 px-5 py-3 opacity-50">
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-sm text-white/60 line-through tracking-wider">{entry.code}</span>
                            {entry.label && <p className="text-xs text-muted-foreground/60 truncate">{entry.label}</p>}
                            <p className="text-[11px] text-muted-foreground/40">
                              استُخدم {entry.usedCount} مرة — {durationLabel(entry.durationDays)}
                            </p>
                          </div>
                          <button onClick={() => deleteCode(entry.code)} disabled={deletingCode === entry.code}
                            className="p-1.5 rounded-lg hover:bg-red-500/15 text-muted-foreground/30 hover:text-red-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          </motion.div>
        )}
      </div>
    </div>
  );
}
