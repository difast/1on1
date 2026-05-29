"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { daysSince, urgencyLevel, urgencyStyles, initials, moodLabels, pickColor, formatDate, formatDateTime, generateInviteCode } from "@/lib/utils";

type Profile = { id: string; name: string; job_title: string | null; telegram: string | null; linkedin: string | null; github: string | null };
type Meeting = { id: string; date: string; mood: string; notes: string | null; scheduled_at: string | null };
type Task = { id: string; text: string; done: boolean; due_date: string | null; member_id: string };
type MeetingRequest = { id: string; proposed_date: string; message: string | null; status: string; member_id: string; members: { name: string } };
type Member = { id: string; name: string; role: string | null; avatar_color: string; user_id: string | null; meetings: Meeting[]; tasks: Task[]; profile?: Profile };
type Team = { id: string; name: string; members: Member[]; invite_code: string };

export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [meetingRequests, setMeetingRequests] = useState<MeetingRequest[]>([]);

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showLogMeeting, setShowLogMeeting] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [showNewMember, setShowNewMember] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  const [teamName, setTeamName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [logMood, setLogMood] = useState("neutral");
  const [logNotes, setLogNotes] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleDate, setScheduleDate] = useState("");
  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [toast, setToast] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const fetchTeams = useCallback(async (uid: string) => {
    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name, invite_codes(code)")
      .eq("owner_id", uid)
      .order("created_at");

    if (!teamsData?.length) { setLoading(false); return; }

    const full: Team[] = await Promise.all(teamsData.map(async (team: any) => {
      const { data: members } = await supabase
        .from("members")
        .select("id, name, role, avatar_color, user_id")
        .eq("team_id", team.id)
        .order("created_at");

      const membersWithData: Member[] = await Promise.all((members || []).map(async (m: any) => {
        const [{ data: meetings }, { data: tasks }, { data: memberProfile }] = await Promise.all([
          supabase.from("meetings").select("*").eq("member_id", m.id).order("date", { ascending: false }),
          supabase.from("tasks").select("*").eq("member_id", m.id).order("created_at", { ascending: false }),
          m.user_id
            ? supabase.from("profiles").select("*").eq("id", m.user_id).single()
            : Promise.resolve({ data: null }),
        ]);
        return { ...m, meetings: meetings || [], tasks: tasks || [], profile: memberProfile || undefined };
      }));

      const code = (team.invite_codes as any[])?.[0]?.code || "";
      return { id: team.id, name: team.name, members: membersWithData, invite_code: code };
    }));

    setTeams(full);
    setActiveTeam(full[0]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const uid = session.user.id;
      setUserId(uid);
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (!prof) { router.push("/profile/setup"); return; }
      setProfile(prof);
      await fetchTeams(uid);
    };
    load();
  }, [fetchTeams, router]);

  useEffect(() => {
    if (!activeTeam) return;
    const memberIds = activeTeam.members.map(m => m.id);
    if (!memberIds.length) return;
    supabase
      .from("meeting_requests")
      .select("*, members(name)")
      .in("member_id", memberIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .then(({ data }) => setMeetingRequests(data || []));
  }, [activeTeam]);

  const createTeam = async () => {
    if (!teamName.trim() || !userId) return;
    const { data: team, error } = await supabase
      .from("teams")
      .insert({ name: teamName.trim(), owner_id: userId })
      .select()
      .single();
    if (error || !team) { showToast("Ошибка создания команды"); return; }
    const code = generateInviteCode();
    await supabase.from("invite_codes").insert({ team_id: team.id, code, active: true });
    const newTeam: Team = { id: team.id, name: team.name, members: [], invite_code: code };
    setTeams(prev => [...prev, newTeam]);
    setActiveTeam(newTeam);
    setTeamName("");
    setShowNewTeam(false);
    showToast("Команда создана");
  };

  const createMember = async () => {
    if (!memberName.trim() || !activeTeam) return;
    const color = pickColor(activeTeam.members.length);
    const { data, error } = await supabase
      .from("members")
      .insert({ team_id: activeTeam.id, name: memberName.trim(), role: memberRole.trim() || null, avatar_color: color })
      .select()
      .single();
    if (error || !data) { showToast("Ошибка добавления участника"); return; }
    const newMember: Member = { ...data, meetings: [], tasks: [] };
    const updated = { ...activeTeam, members: [...activeTeam.members, newMember] };
    setActiveTeam(updated);
    setTeams(prev => prev.map(t => t.id === activeTeam.id ? updated : t));
    setMemberName(""); setMemberRole("");
    setShowNewMember(false);
    showToast(`${memberName} добавлен`);
  };

  const logMeeting = async () => {
    if (!selectedMember || !logNotes.trim()) return;
    const { data, error } = await supabase
      .from("meetings")
      .insert({ member_id: selectedMember.id, mood: logMood, notes: logNotes.trim(), date: logDate })
      .select()
      .single();
    if (error || !data || !activeTeam) return;
    const updatedMember = { ...selectedMember, meetings: [data, ...selectedMember.meetings] };
    const updated = { ...activeTeam, members: activeTeam.members.map(m => m.id === selectedMember.id ? updatedMember : m) };
    setActiveTeam(updated);
    setTeams(prev => prev.map(t => t.id === activeTeam.id ? updated : t));
    setSelectedMember(updatedMember);
    setLogNotes(""); setLogMood("neutral"); setLogDate(new Date().toISOString().slice(0, 10));
    setShowLogMeeting(false);
    showToast("Встреча записана ✓");
  };

  const scheduleMeeting = async () => {
    if (!selectedMember || !scheduleDate || !activeTeam) return;
    const { data, error } = await supabase
      .from("meetings")
      .insert({ member_id: selectedMember.id, scheduled_at: scheduleDate, date: scheduleDate.slice(0, 10), mood: "neutral" })
      .select()
      .single();
    if (error || !data) return;
    const updatedMember = { ...selectedMember, meetings: [data, ...selectedMember.meetings] };
    const updated = { ...activeTeam, members: activeTeam.members.map(m => m.id === selectedMember.id ? updatedMember : m) };
    setActiveTeam(updated);
    setTeams(prev => prev.map(t => t.id === activeTeam.id ? updated : t));
    setSelectedMember(updatedMember);
    setScheduleDate("");
    setShowSchedule(false);
    showToast("Встреча запланирована ✓");
  };

  const addTask = async () => {
    if (!taskText.trim() || !selectedMember || !activeTeam) return;
    const { data, error } = await supabase
      .from("tasks")
      .insert({ member_id: selectedMember.id, text: taskText.trim(), done: false, due_date: taskDue || null })
      .select()
      .single();
    if (error || !data) return;
    const updatedMember = { ...selectedMember, tasks: [data, ...selectedMember.tasks] };
    const updated = { ...activeTeam, members: activeTeam.members.map(m => m.id === selectedMember.id ? updatedMember : m) };
    setActiveTeam(updated);
    setTeams(prev => prev.map(t => t.id === activeTeam.id ? updated : t));
    setSelectedMember(updatedMember);
    setTaskText(""); setTaskDue("");
    setShowAddTask(false);
    showToast("Задача добавлена");
  };

  const toggleTask = async (task: Task) => {
    if (!selectedMember || !activeTeam) return;
    await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
    const updatedMember = { ...selectedMember, tasks: selectedMember.tasks.map(t => t.id === task.id ? { ...t, done: !t.done } : t) };
    const updated = { ...activeTeam, members: activeTeam.members.map(m => m.id === selectedMember.id ? updatedMember : m) };
    setActiveTeam(updated);
    setTeams(prev => prev.map(t => t.id === activeTeam.id ? updated : t));
    setSelectedMember(updatedMember);
  };

  const approveRequest = async (req: MeetingRequest) => {
    await supabase.from("meeting_requests").update({ status: "approved" }).eq("id", req.id);
    await supabase.from("meetings").insert({ member_id: req.member_id, scheduled_at: req.proposed_date, date: req.proposed_date.slice(0, 10), mood: "neutral" });
    setMeetingRequests(prev => prev.filter(r => r.id !== req.id));
    showToast("Встреча подтверждена ✓");
  };

  const declineRequest = async (id: string) => {
    await supabase.from("meeting_requests").update({ status: "declined" }).eq("id", id);
    setMeetingRequests(prev => prev.filter(r => r.id !== id));
    showToast("Запрос отклонён");
  };

  const copyInvite = () => {
    if (!activeTeam?.invite_code) return;
    const url = `${window.location.origin}/join/${activeTeam.invite_code}`;
    navigator.clipboard.writeText(url);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const sortedMembers = activeTeam
    ? [...activeTeam.members].sort((a, b) =>
        daysSince(b.meetings.find(m => !m.scheduled_at || new Date(m.scheduled_at) <= new Date())?.date) -
        daysSince(a.meetings.find(m => !m.scheduled_at || new Date(m.scheduled_at) <= new Date())?.date)
      )
    : [];

  const urgent = sortedMembers.filter(m => urgencyLevel(daysSince(m.meetings[0]?.date)) !== "ok").length;
  const pendingRequests = meetingRequests.length;

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", gap: 6 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#7F77DD", animation: `pulse 1.2s ease ${i*0.2}s infinite` }} />
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      {toast && <div className="toast" style={{ background: "#1D9E75", color: "#fff" }}>{toast}</div>}

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E8E6E1", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>OneOn<span style={{ color: "#7F77DD" }}>One</span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {pendingRequests > 0 && (
            <button onClick={() => setShowRequests(true)} style={{ position: "relative", background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>
              🔔
              <span style={{ position: "absolute", top: -2, right: -4, width: 16, height: 16, background: "#E24B4A", borderRadius: "50%", fontSize: 10, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{pendingRequests}</span>
            </button>
          )}
          {profile && (
            <button onClick={() => setShowMyProfile(true)}
              style={{ width: 34, height: 34, borderRadius: 10, background: "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#7F77DD", border: "none", cursor: "pointer" }}>
              {initials(profile.name)}
            </button>
          )}
          <button onClick={() => supabase.auth.signOut().then(() => router.push("/login"))}
            style={{ fontSize: 13, color: "#999", background: "none", border: "none", cursor: "pointer" }}>
            Выйти
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px" }}>

        {/* Team tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {teams.map(t => (
            <button key={t.id} onClick={() => setActiveTeam(t)}
              style={{ padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 500, border: "1px solid", borderColor: activeTeam?.id === t.id ? "#7F77DD" : "#E8E6E1", background: activeTeam?.id === t.id ? "#EEEDFE" : "#fff", color: activeTeam?.id === t.id ? "#534AB7" : "#555", transition: "all 0.15s", cursor: "pointer" }}>
              {t.name}
            </button>
          ))}
          <button onClick={() => setShowNewTeam(true)}
            style={{ padding: "6px 14px", borderRadius: 99, fontSize: 13, border: "1px dashed #D0CEC7", background: "none", color: "#999", cursor: "pointer" }}>
            + Команда
          </button>
        </div>

        {!activeTeam ? (
          <div className="card animate-fade" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
            <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 8 }}>Создай первую команду</div>
            <div style={{ fontSize: 14, color: "#999", marginBottom: 20 }}>Добавь участников и начни отслеживать встречи</div>
            <button className="btn btn-primary" onClick={() => setShowNewTeam(true)} style={{ padding: "12px 24px" }}>
              Создать команду
            </button>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="stat-grid-3" style={{ marginBottom: 16 }}>
              {[
                { label: "В команде", val: activeTeam.members.length, red: false, onClick: undefined },
                { label: "Нужна встреча", val: urgent, red: urgent > 0, onClick: undefined },
                { label: "Запросов", val: pendingRequests, red: pendingRequests > 0, onClick: () => setShowRequests(true) },
              ].map((s, i) => (
                <div key={i} className={`card animate-fade ${s.onClick ? "card-clickable" : ""}`}
                  style={{ padding: 14, animationDelay: `${i * 0.05}s`, cursor: s.onClick ? "pointer" : "default" }}
                  onClick={s.onClick}>
                  <div style={{ fontSize: 11, color: "#999", fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color: s.red ? "#A32D2D" : "#1a1a1a" }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Invite */}
            <button onClick={() => setShowInvite(true)}
              style={{ width: "100%", padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, border: "1px dashed #B8B5F0", background: "#EEEDFE22", cursor: "pointer", textAlign: "left", borderRadius: 14, transition: "all 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#EEEDFE55")}
              onMouseLeave={e => (e.currentTarget.style.background = "#EEEDFE22")}>
              <span style={{ fontSize: 20 }}>🔗</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#534AB7" }}>Пригласить участника</div>
                <div style={{ fontSize: 12, color: "#999" }}>Скопировать ссылку-приглашение</div>
              </div>
            </button>

            {/* Members */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedMembers.map((member, i) => {
                const lastMeeting = member.meetings.find(m => !m.scheduled_at || new Date(m.scheduled_at) <= new Date());
                const days = daysSince(lastMeeting?.date);
                const u = urgencyStyles[urgencyLevel(days)];
                const upcoming = member.meetings.find(m => m.scheduled_at && new Date(m.scheduled_at) > new Date());
                const openTasks = member.tasks.filter(t => !t.done).length;
                return (
                  <div key={member.id} className="card card-clickable animate-fade"
                    style={{ padding: "14px 16px", cursor: "pointer", animationDelay: `${i * 0.05}s` }}
                    onClick={() => setSelectedMember(member)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ position: "relative" }}>
                        <div style={{ width: 44, height: 44, borderRadius: 13, background: member.avatar_color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: member.avatar_color }}>
                          {initials(member.name)}
                        </div>
                        {member.user_id && (
                          <div style={{ position: "absolute", bottom: -2, right: -2, width: 10, height: 10, borderRadius: "50%", background: "#1D9E75", border: "2px solid #fff" }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{member.name}</span>
                          {lastMeeting?.mood && lastMeeting.mood !== "neutral" && (
                            <span style={{ fontSize: 13 }}>{lastMeeting.mood === "good" ? "😊" : "😟"}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "#999" }}>{member.role || "Участник"}</span>
                          {upcoming && <span style={{ fontSize: 11, color: "#7F77DD", background: "#EEEDFE", padding: "1px 6px", borderRadius: 4 }}>📅 {formatDateTime(upcoming.scheduled_at!)}</span>}
                          {openTasks > 0 && <span style={{ fontSize: 11, color: "#854F0B", background: "#FAEEDA", padding: "1px 6px", borderRadius: 4 }}>{openTasks} задач</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: u.text, background: u.bg, padding: "3px 8px", borderRadius: 6, marginBottom: 3 }}>
                          {days >= 999 ? "Никогда" : `${days}д`}
                        </div>
                        <div style={{ fontSize: 11, color: u.text }}>{u.label}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setShowNewMember(true)}
                style={{ background: "none", border: "1px dashed #D0CEC7", borderRadius: 14, padding: "14px 16px", fontSize: 14, color: "#999", transition: "all 0.15s", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F7F6F3")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                + Добавить участника вручную
              </button>
            </div>
          </>
        )}
      </div>

      {/* Member detail */}
      {selectedMember && !showLogMeeting && !showSchedule && !showAddTask && (
        <div className="modal-overlay" onClick={() => setSelectedMember(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: selectedMember.avatar_color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, color: selectedMember.avatar_color }}>
                    {initials(selectedMember.name)}
                  </div>
                  {selectedMember.user_id && <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: "50%", background: "#1D9E75", border: "2px solid #fff" }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 18 }}>{selectedMember.name}</div>
                  <div style={{ fontSize: 13, color: "#999" }}>{selectedMember.role || "Участник"}</div>
                </div>
              </div>
              <button onClick={() => setSelectedMember(null)} style={{ background: "none", border: "none", fontSize: 22, color: "#bbb", cursor: "pointer" }}>✕</button>
            </div>

            {selectedMember.profile && (selectedMember.profile.telegram || selectedMember.profile.linkedin || selectedMember.profile.github) && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {selectedMember.profile.telegram && <a href={`https://t.me/${selectedMember.profile.telegram.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="social-link">✈️ {selectedMember.profile.telegram}</a>}
                {selectedMember.profile.linkedin && <a href={selectedMember.profile.linkedin} target="_blank" rel="noopener noreferrer" className="social-link">💼 LinkedIn</a>}
                {selectedMember.profile.github && <a href={`https://github.com/${selectedMember.profile.github.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="social-link">🐙 {selectedMember.profile.github}</a>}
              </div>
            )}

            {selectedMember.meetings[0]?.notes && (
              <div style={{ background: "#EEEDFE", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#534AB7", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>💡 Контекст к встрече</div>
                <div style={{ fontSize: 13, color: "#3C3489", lineHeight: 1.5 }}>{selectedMember.meetings[0].notes}</div>
              </div>
            )}

            <div className="action-grid" style={{ marginBottom: 20 }}>
              <button className="btn btn-purple" onClick={() => setShowLogMeeting(true)} style={{ padding: "10px 8px", fontSize: 13 }}>✍️ Записать</button>
              <button className="btn btn-ghost" onClick={() => setShowSchedule(true)} style={{ padding: "10px 8px", fontSize: 13 }}>📅 Запланировать</button>
              <button className="btn btn-ghost" onClick={() => setShowAddTask(true)} style={{ padding: "10px 8px", fontSize: 13 }}>+ Задача</button>
            </div>

            {selectedMember.tasks.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#555", marginBottom: 8 }}>Задачи</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {selectedMember.tasks.map(task => (
                    <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#F7F6F3", borderRadius: 10 }}>
                      <button onClick={() => toggleTask(task)}
                        style={{ width: 20, height: 20, borderRadius: 5, border: task.done ? "none" : "2px solid #D0CEC7", background: task.done ? "#1D9E75" : "none", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s" }}>
                        {task.done && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, textDecoration: task.done ? "line-through" : "none", color: task.done ? "#999" : "#1a1a1a" }}>{task.text}</div>
                        {task.due_date && <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>до {formatDate(task.due_date)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ fontWeight: 600, fontSize: 14, color: "#555", marginBottom: 10 }}>История встреч</div>
            {selectedMember.meetings.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbb", fontSize: 14, padding: "20px 0" }}>Встреч пока не было</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selectedMember.meetings.map(m => (
                  <div key={m.id} style={{ background: "#F7F6F3", borderRadius: 12, padding: "12px 14px", borderLeft: m.scheduled_at && new Date(m.scheduled_at) > new Date() ? "3px solid #7F77DD" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: m.notes ? 6 : 0 }}>
                      <span style={{ fontSize: 12, color: "#bbb", fontFamily: "'DM Mono', monospace" }}>
                        {m.scheduled_at && new Date(m.scheduled_at) > new Date() ? `📅 ${formatDateTime(m.scheduled_at)}` : formatDate(m.date)}
                      </span>
                      {m.mood !== "neutral" && !m.scheduled_at && <span>{m.mood === "good" ? "😊" : "😟"}</span>}
                    </div>
                    {m.notes && <div style={{ fontSize: 13, color: "#444", lineHeight: 1.55 }}>{m.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Log meeting */}
      {showLogMeeting && selectedMember && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Встреча с {selectedMember.name}</div>
              <button onClick={() => setShowLogMeeting(false)} style={{ background: "none", border: "none", fontSize: 22, color: "#bbb", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#555", marginBottom: 8 }}>Дата</div>
            <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="input" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: "#555", marginBottom: 8 }}>Как прошло?</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["good", "neutral", "bad"] as const).map(m => (
                <button key={m} onClick={() => setLogMood(m)}
                  style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: logMood === m ? "2px solid #7F77DD" : "1.5px solid #E8E6E1", background: logMood === m ? "#EEEDFE" : "#fff", fontSize: 12, fontWeight: logMood === m ? 600 : 400, color: logMood === m ? "#534AB7" : "#555", cursor: "pointer", transition: "all 0.15s" }}>
                  {moodLabels[m]}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#555", marginBottom: 8 }}>Заметки</div>
            <textarea value={logNotes} onChange={e => setLogNotes(e.target.value)} placeholder="О чём говорили, что решили..." className="input" style={{ minHeight: 100, marginBottom: 16 }} />
            <button className="btn btn-primary" onClick={logMeeting} disabled={!logNotes.trim()}
              style={{ width: "100%", padding: 14, fontSize: 15, background: !logNotes.trim() ? "#E8E6E1" : undefined, color: !logNotes.trim() ? "#bbb" : undefined }}>
              Сохранить встречу
            </button>
          </div>
        </div>
      )}

      {/* Schedule */}
      {showSchedule && selectedMember && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Запланировать встречу</div>
              <button onClick={() => setShowSchedule(false)} style={{ background: "none", border: "none", fontSize: 22, color: "#bbb", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: 14, color: "#999", marginBottom: 16 }}>с {selectedMember.name}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#555", marginBottom: 8 }}>Дата и время</div>
            <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="input" style={{ marginBottom: 20 }} />
            <button className="btn btn-purple" onClick={scheduleMeeting} disabled={!scheduleDate}
              style={{ width: "100%", padding: 14, fontSize: 15, background: !scheduleDate ? "#E8E6E1" : undefined, color: !scheduleDate ? "#bbb" : undefined }}>
              Запланировать
            </button>
          </div>
        </div>
      )}

      {/* Add task */}
      {showAddTask && selectedMember && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Новая задача</div>
              <button onClick={() => setShowAddTask(false)} style={{ background: "none", border: "none", fontSize: 22, color: "#bbb", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: 14, color: "#999", marginBottom: 16 }}>для {selectedMember.name}</div>
            <input value={taskText} onChange={e => setTaskText(e.target.value)} placeholder="Что нужно сделать..." className="input" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: "#555", marginBottom: 8 }}>Срок (необязательно)</div>
            <input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="input" style={{ marginBottom: 20 }} />
            <button className="btn btn-primary" onClick={addTask} disabled={!taskText.trim()}
              style={{ width: "100%", padding: 14, fontSize: 15, background: !taskText.trim() ? "#E8E6E1" : undefined, color: !taskText.trim() ? "#bbb" : undefined }}>
              Добавить задачу
            </button>
          </div>
        </div>
      )}

      {/* Invite */}
      {showInvite && activeTeam && (
        <div className="modal-overlay-center" onClick={() => setShowInvite(false)}>
          <div className="modal-center animate-scale" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Пригласить в команду</div>
              <button onClick={() => setShowInvite(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#bbb", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: 14, color: "#999", marginBottom: 16 }}>Отправь эту ссылку участнику в Telegram</div>
            <div style={{ background: "#F7F6F3", borderRadius: 12, padding: "12px 14px", fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#555", wordBreak: "break-all", marginBottom: 16 }}>
              {typeof window !== "undefined" ? `${window.location.origin}/join/${activeTeam.invite_code}` : `/join/${activeTeam.invite_code}`}
            </div>
            <button className="btn btn-purple" onClick={copyInvite} style={{ width: "100%", padding: 13, fontSize: 15 }}>
              {copiedInvite ? "✓ Скопировано!" : "Скопировать ссылку"}
            </button>
          </div>
        </div>
      )}

      {/* Requests */}
      {showRequests && (
        <div className="modal-overlay" onClick={() => setShowRequests(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Запросы на встречу</div>
              <button onClick={() => setShowRequests(false)} style={{ background: "none", border: "none", fontSize: 22, color: "#bbb", cursor: "pointer" }}>✕</button>
            </div>
            {meetingRequests.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbb", fontSize: 14, padding: "20px 0" }}>Нет новых запросов</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {meetingRequests.map(req => (
                  <div key={req.id} style={{ background: "#F7F6F3", borderRadius: 14, padding: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{req.members?.name}</div>
                    <div style={{ fontSize: 13, color: "#7F77DD", marginBottom: req.message ? 8 : 12 }}>📅 {formatDateTime(req.proposed_date)}</div>
                    {req.message && <div style={{ fontSize: 13, color: "#555", marginBottom: 12, lineHeight: 1.5 }}>{req.message}</div>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-purple" onClick={() => approveRequest(req)} style={{ flex: 1, padding: "9px" }}>✓ Подтвердить</button>
                      <button className="btn btn-ghost" onClick={() => declineRequest(req.id)} style={{ flex: 1, padding: "9px" }}>Отклонить</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* My profile */}
      {showMyProfile && profile && (
        <div className="modal-overlay-center" onClick={() => setShowMyProfile(false)}>
          <div className="modal-center animate-scale" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Мой профиль</div>
              <button onClick={() => setShowMyProfile(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#bbb", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, color: "#7F77DD" }}>
                {initials(profile.name)}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 17 }}>{profile.name}</div>
                {profile.job_title && <div style={{ fontSize: 13, color: "#999" }}>{profile.job_title}</div>}
              </div>
            </div>
            {(profile.telegram || profile.linkedin || profile.github) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {profile.telegram && <a href={`https://t.me/${profile.telegram.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="social-link" style={{ justifyContent: "center" }}>✈️ {profile.telegram}</a>}
                {profile.linkedin && <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="social-link" style={{ justifyContent: "center" }}>💼 LinkedIn</a>}
                {profile.github && <a href={`https://github.com/${profile.github.replace("@","")}`} target="_blank" rel="noopener noreferrer" className="social-link" style={{ justifyContent: "center" }}>🐙 GitHub</a>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
