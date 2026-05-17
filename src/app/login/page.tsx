"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError("Неверный email или пароль"); setLoading(false); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", (await supabase.auth.getUser()).data.user!.id).single();
      if (!profile) router.push("/profile/setup");
      else if (profile.role === "member") router.push("/member");
      else router.push("/dashboard");
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      router.push("/profile/setup");
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }} className="animate-fade">

        <div style={{ marginBottom: 40, textAlign: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.5px" }}>
            OneOn<span style={{ color: "#7F77DD" }}>One</span>
          </div>
          <div style={{ fontSize: 14, color: "#999", marginTop: 8 }}>Не теряй людей из виду</div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 4 }}>
            {mode === "login" ? "Добро пожаловать" : "Создать аккаунт"}
          </div>
          <div style={{ fontSize: 14, color: "#999", marginBottom: 24 }}>
            {mode === "login" ? "Войди чтобы продолжить" : "Это займёт меньше минуты"}
          </div>

          <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input className="input" type="email" placeholder="email@company.ru" value={email} onChange={e => setEmail(e.target.value)} required />
            <input className="input" type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} required />

            {error && (
              <div style={{ fontSize: 13, color: "#A32D2D", padding: "10px 14px", background: "#FCEBEB", borderRadius: 10 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ marginTop: 4, padding: "13px", fontSize: 15 }}>
              {loading ? "..." : mode === "login" ? "Войти →" : "Зарегистрироваться →"}
            </button>
          </form>

          <button onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }}
            style={{ width: "100%", marginTop: 16, fontSize: 13, color: "#7F77DD", background: "none", border: "none", textAlign: "center" }}>
            {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}
