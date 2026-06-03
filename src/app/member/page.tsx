"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatDate, formatDateTime, initials, moodLabels } from "@/lib/utils";

type Profile = { id: string; name: string; job_title: string | null; telegram: string | null; linkedin: string | null; github: string | null };
type Meeting = { id: string; date: string; mood: string; notes: string | null; scheduled_at: string | null };
type Task = { id: string; text: string; done: boolean; due_date: string | null };
type MeetingRequest = { id: string; proposed_date: string; message: string | null; status: string };

export default function MemberPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [leadProfile, setLeadProfile] = useState<Profile | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showRequestMeeting, setShowRequestMeeting] = useState(false);
  const [showLeadProfile, setShowLeadProfile] = useState(false);
  const [reqDate, setReqDate] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [toast, setToast] = useState("");
  const [activeTab, setActiveTab] = useState<"meetings" | "tasks">("meetings");
  const [taskFilter, setTaskFilter] = useState<'all'|'open'|'done'>('all');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const uid = session.user.id;

      const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (!prof) { router.push("/profile/setup"); return; }
      setProfile(prof);

      const { data: member } = await supabase.from("members").select("id, team_id, teams(owner_id)").eq("user_id", uid).single();
      if (!member) { setLoading(false); return; }
      setMemberId(member.id);

      const teamData = member.teams as any;
      if (teamData?.owner_id) {
        const { data: lp } = await supabase.from("profiles").select("*").eq("id", teamData.owner_id).single();
        setLeadProfile(lp);
      }

      const [{ data: mtgs }, { data: tsks }] = await Promise.all([
        supabase.from("meetings").select("*").eq("member_id", member.id).order("date", { ascending: false }),
        supabase.from("tasks").select("*").eq("member_id", member.id).order("created_at", { ascending: false }),
      ]);
      setMeetings(mtgs || []);
      setTasks(tsks || []);
      setLoading(false);
    };
    load();
  }, [router]);

  const requestMeeting = async () => {
    if (!reqDate || !memberId) return;
    await supabase.from("meeting_requests").insert({ member_id: memberId, proposed_date: reqDate, message: reqMessage.trim() || null, status: "pending" });
    setShowRequestMeeting(false); setReqDate(""); setReqMessage("");
    showToast("Запрос отправлен тимлиду ✓");
  };

  const toggleTask = async (task: Task) => {
    await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !t.done } : t));
  };

  const upcoming = meetings.filter(m => m.scheduled_at && new Date(m.scheduled_at) > new Date());
  const past = meetings.filter(m => !m.scheduled_at || new Date(m.scheduled_at) <= new Date());
  const pendingTasks = tasks.filter(t => !t.done);
  const doneTasks = tasks.filter(t => t.done);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#7F77DD", animation: `pulse 1.2s ease ${i*0.2}s infinite` }} />)}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      {toast && <div className="toast" style={{ background: "#1D9E75", color: "#fff" }}>{toast}</div>}

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E8E6E1", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "fixed", top: 0, left: 0, right: 0, zIndex: 50 }}>
        <div className="app-header-logo" style={{ fontWeight: 600, fontSize: 16, flexShrink: 0 }}>OneOn<span style={{ color: "#7F77DD" }}>One</span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => setShowRequestMeeting(true)} className="btn btn-purple" style={{ padding: "7px 12px", fontSize: 13, whiteSpace: "nowrap" }}>
            + Встреча
          </button>
          <button onClick={() => supabase.auth.signOut().then(() => router.push("/login"))}
            style={{ fontSize: 13, color: "#999", background: "none", border: "none" }}>Выйти</button>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "76px 16px 40px", paddingTop: 76 }}>

        {/* My profile card */}
        {profile && (
          <div className="card animate-fade" style={{ padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, color: "#7F77DD", flexShrink: 0 }}>
                {initials(profile.name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 17 }}>{profile.name}</div>
                {profile.job_title && <div style={{ fontSize: 13, color: "#999" }}>{profile.job_title}</div>}
              </div>
            </div>
            {(profile.telegram || profile.linkedin || profile.github) && (
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {profile.telegram && <a href={`https://t.me/${profile.telegram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="social-link">✈️ {profile.telegram}</a>}
                {profile.linkedin && <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="social-link">💼 LinkedIn</a>}
                {profile.github && <a href={`https://github.com/${profile.github.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="social-link">🐙 {profile.github}</a>}
              </div>
            )}
          </div>
        )}

        {/* Lead card */}
        {leadProfile && (
          <div className="card card-clickable animate-fade" style={{ padding: 16, marginBottom: 14, cursor: "pointer" }} onClick={() => setShowLeadProfile(true)}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Твой тимлид</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: "#534AB722", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#534AB7" }}>
                {initials(leadProfile.name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{leadProfile.name}</div>
                {leadProfile.job_title && <div style={{ fontSize: 12, color: "#999" }}>{leadProfile.job_title}</div>}
              </div>
              <div style={{ fontSize: 13, color: "#bbb" }}>→</div>
            </div>
          </div>
        )}

        {/* Upcoming meetings */}
        {upcoming.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Запланировано</div>
            {upcoming.map(m => (
              <div key={m.id} className="card animate-fade" style={{ padding: 16, marginBottom: 8, borderLeft: "3px solid #7F77DD" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>📅 Встреча с тимлидом</div>
                  <div style={{ fontSize: 12, color: "#7F77DD", fontWeight: 500 }}>{formatDateTime(m.scheduled_at!)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Встреч проведено", val: past.length },
            { label: "Задач открыто", val: pendingTasks.length, red: pendingTasks.length > 0 },
          ].map((s, i) => (
            <div key={i} className="card animate-fade" style={{ padding: 14, animationDelay: `${i * 0.05}s` }}>
              <div style={{ fontSize: 11, color: "#999", fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: s.red ? "#A32D2D" : "#1a1a1a" }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: "#EEECEA", borderRadius: 12, padding: 4, marginBottom: 16 }}>
          {([["meetings", "Встречи"], ["tasks", "Задачи"]] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ flex: 1, padding: "8px", borderRadius: 9, border: "none", fontSize: 14, fontWeight: 500, background: activeTab === tab ? "#fff" : "none", color: activeTab === tab ? "#1a1a1a" : "#999", boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.2s" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Meetings tab */}
        {activeTab === "meetings" && (
          <div className="animate-fade">
            {past.length === 0 ? (
              <div className="card" style={{ padding: 32, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>☕</div>
                <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 6 }}>Встреч пока не было</div>
                <div style={{ fontSize: 13, color: "#999" }}>Запроси первую встречу с тимлидом</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {past.map((m, i) => (
                  <div key={m.id} className="card animate-fade" style={{ padding: "14px 16px", animationDelay: `${i * 0.04}s` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: m.notes ? 8 : 0 }}>
                      <span style={{ fontSize: 12, color: "#bbb", fontFamily: "'DM Mono', monospace" }}>{formatDate(m.date)}</span>
                      <span style={{ fontSize: 16 }}>{m.mood === "good" ? "😊" : m.mood === "bad" ? "😟" : "😐"}</span>
                    </div>
                    {m.notes && <div style={{ fontSize: 13, color: "#444", lineHeight: 1.55 }}>{m.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tasks tab */}
        {activeTab === "tasks" && (
          <div className="animate-fade">
            {tasks.length === 0 ? (
              <div className="card" style={{ padding: 32, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>Задач пока нет</div>
              </div>
            ) : (() => {
              const filtered = tasks.filter(t =>
                taskFilter === 'all' ? true : taskFilter === 'open' ? !t.done : t.done
              );
              return (
                <>
                  <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                    {(['all', 'open', 'done'] as const).map(f => (
                      <button key={f} onClick={() => setTaskFilter(f)}
                        style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 500, border: "1.5px solid", borderColor: taskFilter === f ? "#7F77DD" : "#E8E6E1", background: taskFilter === f ? "#7F77DD" : "#fff", color: taskFilter === f ? "#fff" : "#999", cursor: "pointer", transition: "all 0.15s" }}>
                        {f === 'all' ? 'Все' : f === 'open' ? 'Открытые' : 'Готово'}
                      </button>
                    ))}
                  </div>
                  {filtered.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#bbb", fontSize: 14, padding: "24px 0" }}>
                      {taskFilter === 'open' ? 'Нет открытых задач' : 'Нет выполненных задач'}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {filtered.map((task, i) => (
                        <div key={task.id} className="card animate-fade" style={{ padding: "12px 16px", animationDelay: `${i * 0.04}s`, opacity: task.done ? 0.6 : 1 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                            <button onClick={() => toggleTask(task)}
                              style={{ width: 22, height: 22, borderRadius: 6, border: task.done ? "none" : "2px solid #D0CEC7", background: task.done ? "#1D9E75" : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, transition: "all 0.15s", cursor: "pointer" }}>
                              {task.done && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, textDecoration: task.done ? "line-through" : "none", color: task.done ? "#999" : "#1a1a1a", wordBreak: "break-word" }}>{task.text}</div>
                              {task.due_date && <div style={{ fontSize: 12, color: "#bbb", marginTop: 3 }}>до {formatDate(task.due_date)}</div>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Lead profile modal */}
      {showLeadProfile && leadProfile && (
        <div className="modal-overlay-center" onClick={() => setShowLeadProfile(false)}>
          <div className="modal-center animate-scale" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: "#534AB722", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, color: "#534AB7" }}>
                  {initials(leadProfile.name)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 17 }}>{leadProfile.name}</div>
                  {leadProfile.job_title && <div style={{ fontSize: 13, color: "#999" }}>{leadProfile.job_title}</div>}
                </div>
              </div>
              <button onClick={() => setShowLeadProfile(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#bbb" }}>✕</button>
            </div>
            {(leadProfile.telegram || leadProfile.linkedin || leadProfile.github) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#555", marginBottom: 4 }}>Контакты для связи</div>
                {leadProfile.telegram && <a href={`https://t.me/${leadProfile.telegram.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="social-link" style={{ justifyContent: "center" }}>✈️ Написать в Telegram</a>}
                {leadProfile.linkedin && <a href={leadProfile.linkedin} target="_blank" rel="noopener noreferrer" className="social-link" style={{ justifyContent: "center" }}>💼 LinkedIn</a>}
                {leadProfile.github && <a href={`https://github.com/${leadProfile.github.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="social-link" style={{ justifyContent: "center" }}>🐙 GitHub</a>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Request meeting modal */}
      {showRequestMeeting && (
        <div className="modal-overlay" onClick={() => setShowRequestMeeting(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Запросить встречу</div>
              <button onClick={() => setShowRequestMeeting(false)} style={{ background: "none", border: "none", fontSize: 22, color: "#bbb" }}>✕</button>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#555", marginBottom: 8 }}>Когда тебе удобно?</div>
            <input type="datetime-local" value={reqDate} onChange={e => setReqDate(e.target.value)} className="input" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: "#555", marginBottom: 8 }}>О чём хочешь поговорить?</div>
            <textarea value={reqMessage} onChange={e => setReqMessage(e.target.value)}
              placeholder="Необязательно, но поможет тимлиду подготовиться..."
              className="input" style={{ minHeight: 90, marginBottom: 16 }} />
            <button className="btn btn-purple" onClick={requestMeeting} disabled={!reqDate}
              style={{ width: "100%", padding: 14, fontSize: 15, background: !reqDate ? "#E8E6E1" : undefined, color: !reqDate ? "#bbb" : undefined }}>
              Отправить запрос
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
