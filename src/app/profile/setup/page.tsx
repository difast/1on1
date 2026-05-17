"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ProfileSetup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [telegram, setTelegram] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [userRole, setUserRole] = useState<"teamlead" | "member">("teamlead");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const save = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      name: name.trim(),
      role: userRole,
      job_title: role.trim() || null,
      telegram: telegram.trim() || null,
      linkedin: linkedin.trim() || null,
      github: github.trim() || null,
    });
    if (userRole === "teamlead") router.push("/dashboard");
    else router.push("/member");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }} className="animate-fade">
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.5px" }}>
            OneOn<span style={{ color: "#7F77DD" }}>One</span>
          </div>
          <div style={{ fontSize: 14, color: "#999", marginTop: 8 }}>Расскажи немного о себе</div>
        </div>
        <div className="card" style={{ padding: 28 }}>
          {step === 1 ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 20 }}>Кто ты?</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                {[
                  { val: "teamlead", icon: "🎯", label: "Тимлид", desc: "Веду команду" },
                  { val: "member", icon: "👨‍💻", label: "Участник", desc: "Состою в команде" },
                ].map(opt => (
                  <button key={opt.val} onClick={() => setUserRole(opt.val as any)}
                    style={{ padding: "16px 12px", borderRadius: 14, border: userRole === opt.val ? "2px solid #7F77DD" : "1.5px solid #E8E6E1", background: userRole === opt.val ? "#EEEDFE" : "#fff", textAlign: "center", transition: "all 0.15s", cursor: "pointer" }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{opt.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: userRole === opt.val ? "#534AB7" : "#1a1a1a" }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
              <button className="btn btn-purple" style={{ width: "100%", padding: 13, fontSize: 15 }} onClick={() => setStep(2)}>
                Далее →
              </button>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 20 }}>Твой профиль</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input className="input" placeholder="Имя и фамилия *" value={name} onChange={e => setName(e.target.value)} />
                <input className="input" placeholder="Должность (например: Senior Frontend)" value={role} onChange={e => setRole(e.target.value)} />
                <div style={{ height: 1, background: "#F0EEE9", margin: "4px 0" }} />
                <div style={{ fontSize: 13, color: "#999", marginBottom: 2 }}>Соцсети (необязательно)</div>
                <input className="input" placeholder="Telegram (@username)" value={telegram} onChange={e => setTelegram(e.target.value)} style={{ fontSize: 14 }} />
                <input className="input" placeholder="LinkedIn (ссылка)" value={linkedin} onChange={e => setLinkedin(e.target.value)} style={{ fontSize: 14 }} />
                <input className="input" placeholder="GitHub (@username)" value={github} onChange={e => setGithub(e.target.value)} style={{ fontSize: 14 }} />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)} style={{ flex: "0 0 auto", padding: "12px 16px" }}>←</button>
                <button className="btn btn-purple" onClick={save} disabled={!name.trim() || loading}
                  style={{ flex: 1, padding: 13, fontSize: 15, background: !name.trim() ? "#E8E6E1" : undefined, color: !name.trim() ? "#bbb" : undefined }}>
                  {loading ? "Сохраняем..." : "Начать →"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}