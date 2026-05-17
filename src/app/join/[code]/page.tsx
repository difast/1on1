"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function JoinPage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;
  const [team, setTeam] = useState<{ id: string; name: string; owner_name: string } | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "invalid" | "joining">("loading");

  useEffect(() => {
    const load = async () => {
      const { data: invite } = await supabase
        .from("invite_codes")
        .select("team_id, teams(name, owner_id, profiles(name))")
        .eq("code", code.toUpperCase())
        .eq("active", true)
        .single();

      if (!invite) { setStatus("invalid"); return; }
      const t = invite.teams as any;
      setTeam({ id: invite.team_id, name: t.name, owner_name: t.profiles?.name || "Тимлид" });
      setStatus("found");
    };
    load();
  }, [code]);

  const join = async () => {
    setStatus("joining");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      localStorage.setItem("pending_invite", code);
      router.push("/login");
      return;
    }
    const uid = session.user.id;
    const { data: profile } = await supabase.from("profiles").select("id, name").eq("id", uid).single();
    if (!profile?.name) {
      localStorage.setItem("pending_invite", code);
      router.push("/profile/setup");
      return;
    }
    // Add as member
    await supabase.from("members").upsert({
      team_id: team!.id,
      user_id: uid,
      name: profile.name,
      avatar_color: "#7F77DD",
    });
    router.push("/member");
  };

  if (status === "loading") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 14, color: "#999" }}>Проверяем приглашение...</div>
    </div>
  );

  if (status === "invalid") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card animate-fade" style={{ padding: 32, maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
        <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Ссылка недействительна</div>
        <div style={{ fontSize: 14, color: "#999" }}>Попроси тимлида прислать новую ссылку-приглашение</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380 }} className="animate-fade">
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 600 }}>OneOn<span style={{ color: "#7F77DD" }}>One</span></div>
        </div>
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>
            🎉
          </div>
          <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 8 }}>Тебя приглашают!</div>
          <div style={{ fontSize: 15, color: "#555", marginBottom: 4 }}>
            <strong>{team?.owner_name}</strong> приглашает тебя в команду
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#7F77DD", marginBottom: 24, padding: "8px 16px", background: "#EEEDFE", borderRadius: 10, display: "inline-block" }}>
            {team?.name}
          </div>
          <button className="btn btn-purple" onClick={join} disabled={status === "joining"}
            style={{ width: "100%", padding: 14, fontSize: 15 }}>
            {status === "joining" ? "Присоединяемся..." : "Присоединиться →"}
          </button>
          <div style={{ fontSize: 12, color: "#bbb", marginTop: 16 }}>
            Потребуется регистрация если ещё нет аккаунта
          </div>
        </div>
      </div>
    </div>
  );
}
