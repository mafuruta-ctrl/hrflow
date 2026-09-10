"use client";

import { useState, useEffect, useCallback } from "react";

const GAS_URL = "https://script.google.com/a/macros/gmo-c.jp/s/AKfycby0WqNGKvj1LdvgzzvR7oWUAq8Nzl0HS6Jt_RWi6BTXYHNfIlub6s5toDTR0ZTmUYMGMQ/exec";

const CATEGORIES = [
  { key: "NYUSHA",   label: "入社",  color: "#378ADD", light: "#E6F1FB", dark: "#0C447C", icon: "👤" },
  { key: "TAISHA",   label: "退社",  color: "#E24B4A", light: "#FCEBEB", dark: "#791F1F", icon: "👋" },
  { key: "KYUSHOKU", label: "休職",  color: "#BA7517", light: "#FAEEDA", dark: "#412402", icon: "🏥" },
  { key: "FUKKOKU",  label: "復職",  color: "#1D9E75", light: "#E1F5EE", dark: "#04342C", icon: "✨" },
];

const ASSIGNEE_ORDER = [
  '小林 達也',
  '古田 真美',
  '中野 優子',
  '荻原 広太郎',
  '浅水 琴',
];

function fetchFromGAS(params) {
  return new Promise((resolve, reject) => {
    const cbName = "gasCallback_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const url = new URL(GAS_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set("callback", cbName);
    const timer = setTimeout(() => { delete window[cbName]; if (script.parentNode) script.parentNode.removeChild(script); reject(new Error("タイムアウト")); }, 90000);
    window[cbName] = (data) => { clearTimeout(timer); delete window[cbName]; if (script.parentNode) script.parentNode.removeChild(script); resolve(data); };
    const script = document.createElement("script");
    script.onerror = () => { clearTimeout(timer); delete window[cbName]; reject(new Error("読み込みエラー")); };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function postToGAS(body) {
  return new Promise((resolve, reject) => {
    const cbName = "gasCallback_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const url = new URL(GAS_URL);
    if (body.action === "updateCard") {
      url.searchParams.set("type", "updateCard");
      url.searchParams.set("sheet", body.sheet);
      url.searchParams.set("rowIndex", body.rowIndex);
      url.searchParams.set("data", JSON.stringify(body.data));
    } else if (body.type === "saveComment") {
      url.searchParams.set("type", "saveComment");
      url.searchParams.set("sheet", body.sheet);
      url.searchParams.set("rowIndex", body.rowIndex);
      url.searchParams.set("taskIndex", body.taskIndex);
      url.searchParams.set("comment", body.comment);
    } else {
      url.searchParams.set("type", "updateTask");
      url.searchParams.set("sheet", body.sheet);
      url.searchParams.set("rowIndex", body.rowIndex);
      url.searchParams.set("taskIndex", body.taskIndex);
      url.searchParams.set("value", body.value);
    }
    url.searchParams.set("callback", cbName);
    const timer = setTimeout(() => {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error("タイムアウト"));
    }, 60000);
    window[cbName] = (data) => {
      clearTimeout(timer);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      resolve(data);
    };
    const script = document.createElement("script");
    script.onerror = () => { clearTimeout(timer); delete window[cbName]; reject(new Error("読み込みエラー")); };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function getStatusLabel(progress, isOverdue, daysLeft) {
  if (progress === 100) return { label: "完了", color: "#1D9E75", bg: "#E1F5EE" };
  if (isOverdue)        return { label: "期限超過", color: "#E24B4A", bg: "#FCEBEB" };
  if (daysLeft !== null && daysLeft <= 2) return { label: "期限間近", color: "#BA7517", bg: "#FAEEDA" };
  if (progress > 0)     return { label: "対応中", color: "#378ADD", bg: "#E6F1FB" };
  return { label: "未着手", color: "#888780", bg: "#F1EFE8" };
}

function getCardName(card) { return card.name || "（氏名未設定）"; }

function getCardSub(card, key) {
  switch (key) {
    case "NYUSHA":   return [card.headquarters, card.department, card.team, card.position].filter(Boolean).join(" · ");
    case "TAISHA":   return card.department || "";
    case "KYUSHOKU": return card.department || "";
    case "FUKKOKU":  return [card.department, card.assignee].filter(Boolean).join(" · ");
    default: return "";
  }
}

function getCardDateInfo(card, key) {
  switch (key) {
    case "NYUSHA":   return [{ label: "入社日", value: card.nyushaDate }];
    case "TAISHA":   return [{ label: "退職日", value: card.taishaDate }, { label: "最終出社日", value: card.lastDay }];
    case "KYUSHOKU": return [{ label: "休職開始", value: card.startDate }, { label: "復職予定", value: card.returnDate }];
    case "FUKKOKU":  return [{ label: "復職日", value: card.fukkokuDate }];
    default: return [];
  }
}

function initials(name) {
  if (!name) return "？";
  const c = name.trim();
  return c.length >= 2 ? c[0] + c[1] : c[0];
}

function groupTasksByAssignee(tasks) {
  const groups = {};
  tasks.forEach(task => {
    const key = task.assignee || "未割当";
    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  });
  const sorted = {};
  ASSIGNEE_ORDER.forEach(name => { if (groups[name]) sorted[name] = groups[name]; });
  Object.keys(groups).forEach(name => { if (!sorted[name]) sorted[name] = groups[name]; });
  return sorted;
}

function getDueStyle(due) {
  if (!due) return null;
  const isDate = /^\d{4}\/\d{2}\/\d{2}$/.test(due);
  if (!isDate) return { text: due, color: "#555", bg: "#F1EFE8" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d     = new Date(due.replace(/\//g, "-"));
  const days  = Math.ceil((d - today) / (1000 * 60 * 60 * 24));
  if (days < 0)  return { text: `${due}（${Math.abs(days)}日超過）`, color: "#E24B4A", bg: "#FCEBEB" };
  if (days <= 2) return { text: `${due}（あと${days}日）`, color: "#BA7517", bg: "#FAEEDA" };
  return { text: due, color: "#555", bg: "#F1EFE8" };
}

function getAllAssignees(cards) {
  const set = new Set();
  Object.values(cards).forEach(list => {
    (list || []).forEach(card => (card.tasks || []).forEach(t => { if (t.assignee) set.add(t.assignee); }));
  });
  return ASSIGNEE_ORDER.filter(a => set.has(a)).concat(Array.from(set).filter(a => !ASSIGNEE_ORDER.includes(a)));
}

function ProgressBar({ progress, color }) {
  return (
    <div style={{ background: "#F1EFE8", borderRadius: 99, height: 4, overflow: "hidden" }}>
      <div style={{ width: `${progress}%`, height: "100%", background: color, borderRadius: 99, transition: "width .4s ease" }} />
    </div>
  );
}

function TaskCard({ card, category, onClick, isCompleted }) {
  const status = getStatusLabel(card.progress, card.isOverdue, card.daysLeft);
  const name   = getCardName(card);
  const dates  = getCardDateInfo(card, category.key).filter(d => d.value);
  return (
    <div onClick={() => onClick(card, category)}
      style={{ background: isCompleted ? "#FAFAF8" : "#fff", border: "1px solid #E8E6E0", borderLeft: `3px solid ${isCompleted ? "#B4B2A9" : category.color}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", transition: "transform .1s", opacity: isCompleted ? 0.75 : 1 }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
      onMouseLeave={e => e.currentTarget.style.transform = ""}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: isCompleted ? "#E8E6E0" : category.light, color: isCompleted ? "#888" : category.dark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{initials(name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: isCompleted ? "#888" : "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          {getCardSub(card, category.key) && <div style={{ fontSize: 11, color: "#aaa", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getCardSub(card, category.key)}</div>}
        </div>
        {isCompleted && <span style={{ fontSize: 16 }}>✅</span>}
      </div>
      {dates.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          {dates.map(d => <span key={d.label} style={{ fontSize: 10, color: "#999" }}><span style={{ color: "#bbb" }}>{d.label}：</span>{d.value}</span>)}
        </div>
      )}
      {!isCompleted && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 3 }}>
            <span></span><span>{card.doneTasks}/{card.totalTasks}</span>
          </div>
          <ProgressBar progress={card.progress} color={category.color} />
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: status.bg, color: status.color, fontWeight: 500 }}>{status.label}</span>
        {!isCompleted && card.progress < 100 && (
          <span style={{ fontSize: 10, color: "#888" }}>
            残り{card.totalTasks - card.doneTasks}タスク
          </span>
        )}
      </div>
    </div>
  );
}

function CompletedSection({ cards, category, onClick }) {
  const [open, setOpen] = useState(false);
  if (cards.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, cursor: "pointer", background: "#F1EFE8", border: "1px solid #E8E6E0" }}
        onMouseEnter={e => e.currentTarget.style.background = "#E8E6E0"}
        onMouseLeave={e => e.currentTarget.style.background = "#F1EFE8"}
      >
        <span style={{ fontSize: 13 }}>✅</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#666", flex: 1 }}>完了 {cards.length}件</span>
        <span style={{ fontSize: 12, color: "#999", transition: "transform .2s", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>▾</span>
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {cards.map((card, idx) => (
            <TaskCard key={idx} card={card} category={category} onClick={onClick} isCompleted={true} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, category, onToggle, onComment }) {
  const dueStyle = getDueStyle(task.due);
  const hasComment = !!task.comment;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${hasComment ? "#FFC107" : "#F0EDE8"}`, background: task.done ? "#FAFAF8" : "#fff", position: "relative" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, cursor: "pointer", minWidth: 0 }}
        onMouseEnter={e => e.currentTarget.parentElement.style.background = "#F8F7F4"}
        onMouseLeave={e => e.currentTarget.parentElement.style.background = task.done ? "#FAFAF8" : "#fff"}
      >
        <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, border: task.done ? "none" : "1.5px solid #D3D1C7", background: task.done ? category.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {task.done && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: task.done ? "#B4B2A9" : "#1a1a1a", textDecoration: task.done ? "line-through" : "none", lineHeight: 1.4 }}>{task.name}</div>
          {dueStyle && <span style={{ display: "inline-block", fontSize: 10, marginTop: 3, padding: "1px 6px", borderRadius: 99, background: dueStyle.bg, color: dueStyle.color }}>📅 {dueStyle.text}</span>}
          {hasComment && <div style={{ fontSize: 11, color: "#B8860B", marginTop: 4, padding: "3px 8px", background: "#FFF9E6", borderRadius: 6, borderLeft: "3px solid #FFC107" }}>💬 {task.comment}</div>}
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onComment(); }} style={{ flexShrink: 0, border: "none", background: "none", cursor: "pointer", fontSize: 14, opacity: hasComment ? 1 : 0.6, padding: "0 2px", color: hasComment ? "#FFC107" : "#378ADD", marginTop: 1 }} title="コメントを追加">💬</button>
    </div>
  );
}

function CommentModal({ taskName, comment, onClose, onSave }) {
  const [text, setText] = useState(comment || "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #E8E6E0", background: "#FFF9E6", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>💬</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>コメントを追加</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>{taskName}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>×</button>
        </div>
        <div style={{ padding: "16px" }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="未対応の理由やメモを入力してください..."
            style={{ width: "100%", height: 100, border: "1px solid #E8E6E0", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "inherit" }}
            autoFocus
          />
        </div>
        <div style={{ padding: "0 16px 16px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {text && <button onClick={() => onSave("")} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #E8E6E0", background: "#fff", fontSize: 12, cursor: "pointer", color: "#E24B4A" }}>削除</button>}
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #E8E6E0", background: "#fff", fontSize: 13, cursor: "pointer", color: "#444" }}>キャンセル</button>
          <button onClick={() => onSave(text)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#FFC107", fontSize: 13, cursor: "pointer", color: "#fff", fontWeight: 600 }}>保存</button>
        </div>
      </div>
    </div>
  );
}

function AssigneeGroup({ assignee, tasks, category, onToggleTask, onCommentTask, filterAssignee }) {
  const [open, setOpen] = useState(false);
  const done  = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const pct   = Math.round(done / total * 100);
  const displayTasks = filterAssignee ? tasks.filter(t => !t.done) : tasks;
  if (filterAssignee && displayTasks.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer", background: "#F8F7F4", marginBottom: open ? 8 : 0 }}
        onMouseEnter={e => e.currentTarget.style.background = "#F1EFE8"}
        onMouseLeave={e => e.currentTarget.style.background = "#F8F7F4"}
      >
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: category.light, color: category.dark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(assignee)}</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>{assignee}</span>
        {filterAssignee
          ? <span style={{ fontSize: 11, color: "#E24B4A" }}>未着手 {displayTasks.length}件</span>
          : <span style={{ fontSize: 11, color: pct === 100 ? "#1D9E75" : "#888" }}>{done}/{total}</span>
        }
        {!filterAssignee && (
          <div style={{ width: 50, height: 4, borderRadius: 99, background: "#E8E6E0", overflow: "hidden", marginLeft: 6 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#1D9E75" : category.color, borderRadius: 99 }} />
          </div>
        )}
        <span style={{ fontSize: 12, color: "#888", transition: "transform .2s", transform: open ? "rotate(0deg)" : "rotate(-90deg)", marginLeft: 4 }}>▾</span>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {displayTasks.map((task, idx) => (
            <TaskRow key={idx} task={task} category={category}
              onToggle={() => onToggleTask(task.index)}
              onComment={() => onCommentTask(task.index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EditModal({ card, category, onClose, onSave }) {
  const [form, setForm] = useState({ ...card });
  const fields = {
    NYUSHA:   [{ key: "name", label: "氏名" }, { key: "nyushaDate", label: "入社日" }, { key: "employment", label: "雇用形態" }, { key: "division", label: "統括本部" }, { key: "headquarters", label: "本部" }, { key: "department", label: "部署" }, { key: "team", label: "チーム" }, { key: "position", label: "役職" }, { key: "employeeNo", label: "社員番号" }, { key: "email", label: "メールアドレス" }, { key: "adAccount", label: "ADアカウント" }],
    TAISHA:   [{ key: "name", label: "退職者氏名" }, { key: "department", label: "部署" }, { key: "taishaDate", label: "退職日" }, { key: "lastDay", label: "最終出社日" }],
    KYUSHOKU: [{ key: "name", label: "氏名" }, { key: "department", label: "所属" }, { key: "startDate", label: "休職開始日" }, { key: "reason", label: "休職理由" }, { key: "returnDate", label: "復職予定日" }],
    FUKKOKU:  [{ key: "name", label: "氏名" }, { key: "department", label: "部署" }, { key: "fukkokuDate", label: "復職日" }, { key: "assignee", label: "担当者" }, { key: "status", label: "状況" }],
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: 480, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E6E0", display: "flex", alignItems: "center", gap: 10, background: category.light }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: category.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{initials(getCardName(card))}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: category.dark }}>カードを編集</div>
            <div style={{ fontSize: 11, color: category.dark, opacity: .7 }}>{getCardName(card)}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: category.dark, opacity: .6 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {(fields[category.key] || []).map(({ key, label }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 }}>{label}</label>
              <input value={form[key] || ""} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width: "100%", border: "1px solid #E8E6E0", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = category.color}
                onBlur={e => e.target.style.borderColor = "#E8E6E0"} />
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #E8E6E0", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #E8E6E0", background: "#fff", fontSize: 13, cursor: "pointer", color: "#444" }}>キャンセル</button>
          <button onClick={() => onSave(form)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: category.color, fontSize: 13, cursor: "pointer", color: "#fff", fontWeight: 600 }}>保存する</button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ card, category, onClose, onToggleTask, onEdit, filterAssignee, onSaveComment }) {
  if (!card) return null;
  const name     = getCardName(card);
  const status   = getStatusLabel(card.progress, card.isOverdue, card.daysLeft);
  const groups   = groupTasksByAssignee(card.tasks || []);
  const dates    = getCardDateInfo(card, category.key).filter(d => d.value);
  const [commentModal, setCommentModal] = useState(null);
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 860, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,.18)", animation: "popIn .2s ease", overflow: "hidden" }}>
        <style>{`@keyframes popIn { from { transform: scale(.96); opacity:0 } to { transform: scale(1); opacity:1 } }`}</style>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E6E0", background: category.light, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: category.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{initials(name)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: category.dark }}>{name}</div>
            <div style={{ fontSize: 12, color: category.dark, opacity: .7 }}>{getCardSub(card, category.key)}</div>
          </div>
          <button onClick={onEdit} style={{ border: `1px solid ${category.color}`, background: "#fff", color: category.dark, borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✏️ 編集</button>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 22, color: category.dark, opacity: .5, marginLeft: 4, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F0EDE8", flexShrink: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
            {[
              { label: "進捗率", value: `${card.progress}%`, color: card.progress === 100 ? "#1D9E75" : category.color },
              { label: "完了",   value: `${card.doneTasks}/${card.totalTasks}` },
              { label: "残タスク数", value: `${card.totalTasks - card.doneTasks}件` },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#F8F7F4", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: color || "#1a1a1a" }}>{value}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <ProgressBar progress={card.progress} color={category.color} />
        </div>
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #F0EDE8", display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
          {dates.map(d => <span key={d.label} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: category.light, color: category.dark }}>{d.label}：{d.value}</span>)}
          {card.employment && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "#F1EFE8", color: "#444" }}>{card.employment}</span>}
          {card.status     && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "#F1EFE8", color: "#444" }}>{card.status}</span>}
          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: status.bg, color: status.color, fontWeight: 500 }}>{status.label}</span>
          {card.overdueTaskCount > 0 && (
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "#FCEBEB", color: "#E24B4A", fontWeight: 600 }}>期日超過タスク {card.overdueTaskCount}件</span>
          )}
          {category.key === "NYUSHA" && (
            <>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "#F1EFE8", color: card.kana ? "#444" : "#aaa" }}>カナ：{card.kana || "未定"}</span>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "#F1EFE8", color: card.employeeNo ? "#444" : "#aaa" }}>社員番号：{card.employeeNo || "未定"}</span>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "#F1EFE8", color: card.email ? "#444" : "#aaa" }}>メール：{card.email || "未定"}</span>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "#F1EFE8", color: card.adAccount ? "#444" : "#aaa" }}>ADアカウント：{card.adAccount || "未定"}</span>
            </>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 12 }}>
            {filterAssignee ? `${filterAssignee} の未着手タスク` : "タスクチェックリスト — 担当者別"}
          </div>
          {card.tasks && card.tasks.length > 0
            ? Object.entries(groups).map(([assignee, tasks]) => (
              (!filterAssignee || assignee === filterAssignee) && (
                <AssigneeGroup key={assignee} assignee={assignee} tasks={tasks} category={category}
                  onToggleTask={(taskIndex) => onToggleTask(card, category.key, taskIndex)}
                  onCommentTask={(taskIndex) => setCommentModal({ taskIndex, taskName: (card.tasks[taskIndex] || {}).name || "" })}
                  filterAssignee={filterAssignee} />
              )
            ))
            : <div style={{ fontSize: 13, color: "#888", textAlign: "center", marginTop: 20 }}>タスクがありません</div>
          }
        </div>
      </div>
      {commentModal && (
        <CommentModal
          taskName={commentModal.taskName}
          comment={(card.tasks[commentModal.taskIndex] || {}).comment || ""}
          onClose={() => setCommentModal(null)}
          onSave={(text) => {
            onSaveComment(card, category.key, commentModal.taskIndex, text);
            setCommentModal(null);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  const [cards, setCards]           = useState({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [selectedCard, setSelected] = useState(null);
  const [selectedCat, setSelCat]    = useState(null);
  const [editCard, setEditCard]     = useState(null);
  const [editCat, setEditCat]       = useState(null);
  const [filters, setFilters]       = useState({ status: "", search: "", assignee: "", hideCompleted: false });
  const [lastSync, setLastSync]     = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // 以前は6シート分を並列にJSONPリクエストしており、GAS側の同時実行数上限に
      // 引っかかって一部が503エラーになることがあった（読み込みエラーの原因）。
      // 全シートを1回のリクエストでまとめて取得するAPI（type=allCards）に統合。
      const json = await fetchFromGAS({ type: "allCards" });
      if (!json.success) throw new Error(json.error || "不明なエラー");

      const byKey = json.data || {};
      const results = {};
      CATEGORIES.forEach(cat => {
        if (cat.key === "NYUSHA" || cat.key === "TAISHA") {
          const cards1 = byKey[cat.key] || [];
          const cards2 = byKey[cat.key + "_HAKEN"] || [];
          results[cat.key] = [...cards1, ...cards2];
        } else {
          results[cat.key] = byKey[cat.key] || [];
        }
      });
      setCards(results);
      setLastSync(new Date());
    } catch (e) {
      setError(`データの取得に失敗しました。\n（${e.message}）`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleToggleTask = async (card, sheetKey, taskIndex) => {
    const task     = card.tasks[taskIndex];
    const newValue = !task.done;
    setCards(prev => {
      const next = { ...prev };
      next[sheetKey] = prev[sheetKey].map(c => {
        if (c.rowIndex !== card.rowIndex || c.sheetKey !== card.sheetKey) return c;
        const newTasks = c.tasks.map((t, i) => i === taskIndex ? { ...t, done: newValue } : t);
        const done     = newTasks.filter(t => t.done).length;
        const updated  = { ...c, tasks: newTasks, doneTasks: done, progress: Math.round(done / newTasks.length * 100) };
        if (selectedCard?.rowIndex === card.rowIndex && selectedCard?.sheetKey === card.sheetKey) setSelected(updated);
        return updated;
      });
      return next;
    });
    try {
      await postToGAS({ sheet: card.sheetKey, rowIndex: card.rowIndex, taskIndex, value: newValue });
    } catch (e) { console.error("タスク更新エラー:", e); }
  };

  const handleSaveComment = async (card, sheetKey, taskIndex, commentText) => {
    try {
      await postToGAS({ type: "saveComment", sheet: card.sheetKey, rowIndex: card.rowIndex, taskIndex, comment: commentText });
      setCards(prev => {
        const next = { ...prev };
        next[sheetKey] = prev[sheetKey].map(c => {
          if (c.rowIndex !== card.rowIndex || c.sheetKey !== card.sheetKey) return c;
          const newTasks = c.tasks.map((t, i) => i === taskIndex ? { ...t, comment: commentText } : t);
          const updated  = { ...c, tasks: newTasks };
          if (selectedCard?.rowIndex === card.rowIndex && selectedCard?.sheetKey === card.sheetKey) setSelected(updated);
          return updated;
        });
        return next;
      });
    } catch (e) { console.error("コメント保存エラー:", e); }
  };

  const handleSaveEdit = async (updatedCard) => {
    if (!editCard || !editCat) return;
    try {
      await postToGAS({ action: "updateCard", sheet: editCat.key, rowIndex: editCard.rowIndex, data: updatedCard });
      setCards(prev => {
        const next = { ...prev };
        next[editCat.key] = prev[editCat.key].map(c => c.rowIndex === editCard.rowIndex ? { ...c, ...updatedCard } : c);
        return next;
      });
      if (selectedCard?.rowIndex === editCard.rowIndex) setSelected(prev => ({ ...prev, ...updatedCard }));
    } catch (e) { console.error("カード更新エラー:", e); }
    setEditCard(null); setEditCat(null);
  };

  const filterCards = (list) => (list || []).filter(c => {
    if (filters.search && !getCardName(c).includes(filters.search)) return false;
    if (filters.hideCompleted && c.progress === 100) return false;
    if (filters.status === "inProgress" && !(c.progress > 0 && c.progress < 100)) return false;
    if (filters.status === "notStarted" && c.progress !== 0) return false;
    if (filters.status === "completed"  && c.progress !== 100) return false;
    if (filters.status === "overdue"    && !c.isOverdue) return false;
    if (filters.assignee) {
      const hasTasks = (c.tasks || []).some(t => t.assignee === filters.assignee && !t.done);
      if (!hasTasks) return false;
    }
    return true;
  });

  const allAssignees = getAllAssignees(cards);
  const totalCards   = Object.values(cards).reduce((s, a) => s + (a || []).length, 0);
  const totalOverdue = Object.values(cards).reduce((s, a) => s + (a || []).filter(c => c.isOverdue).length, 0);

  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: "#F5F3EE", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#0C447C", padding: "0 20px", display: "flex", alignItems: "center", gap: 12, height: 52, flexShrink: 0 }}>
        <svg width="26" height="26" viewBox="0 0 44 44" fill="none">
          <rect width="44" height="44" rx="10" fill="#185FA5"/>
          <rect x="8" y="10" width="28" height="5" rx="2.5" fill="#E6F1FB"/>
          <rect x="8" y="20" width="20" height="5" rx="2.5" fill="#85B7EB"/>
          <rect x="8" y="30" width="24" height="5" rx="2.5" fill="#B5D4F4"/>
          <circle cx="36" cy="32.5" r="4" fill="#378ADD"/>
          <path d="M34 32.5 L36 34.5 L39 30.5" stroke="#E6F1FB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>HR<span style={{ color: "#85B7EB" }}>Flow</span></span>
        <div style={{ flex: 1 }} />
        {totalOverdue > 0 && <span style={{ fontSize: 11, background: "#E24B4A", color: "#fff", borderRadius: 99, padding: "2px 10px", fontWeight: 600 }}>期限超過 {totalOverdue}件</span>}
        <span style={{ fontSize: 11, color: "#85B7EB" }}>{lastSync ? `最終同期：${lastSync.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : "同期中..."}</span>
        <button onClick={fetchAll} style={{ background: "#185FA5", border: "none", color: "#B5D4F4", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>↻ 更新</button>
      </div>

      <div style={{ background: "#fff", borderBottom: "1px solid #E8E6E0", padding: "8px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <input type="text" placeholder="🔍 氏名で検索..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          style={{ border: "1px solid #E8E6E0", borderRadius: 6, padding: "5px 10px", fontSize: 12, width: 160, outline: "none" }} />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={{ border: "1px solid #E8E6E0", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "#444", background: "#fff" }}>
          <option value="">進捗：すべて</option>
          <option value="notStarted">未着手</option>
          <option value="inProgress">対応中</option>
          <option value="completed">完了</option>
          <option value="overdue">期限超過</option>
        </select>
        <select value={filters.assignee} onChange={e => setFilters(f => ({ ...f, assignee: e.target.value }))}
          style={{ border: filters.assignee ? "1px solid #378ADD" : "1px solid #E8E6E0", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: filters.assignee ? "#0C447C" : "#444", background: filters.assignee ? "#E6F1FB" : "#fff", fontWeight: filters.assignee ? 600 : 400 }}>
          <option value="">担当者：すべて</option>
          {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          onClick={() => setFilters(f => ({ ...f, hideCompleted: !f.hideCompleted }))}
          style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, cursor: "pointer", border: filters.hideCompleted ? "none" : "1px solid #E8E6E0", background: filters.hideCompleted ? "#1D9E75" : "#fff", color: filters.hideCompleted ? "#fff" : "#888", fontWeight: filters.hideCompleted ? 600 : 400, whiteSpace: "nowrap" }}>
          {filters.hideCompleted ? "✅ 完了非表示中" : "完了を非表示"}
        </button>
        {filters.assignee && <span style={{ fontSize: 11, color: "#378ADD", background: "#E6F1FB", padding: "3px 8px", borderRadius: 99 }}>{filters.assignee} の未着手タスクを表示中</span>}
        {(filters.search || filters.status || filters.assignee || filters.hideCompleted) && (
          <button onClick={() => setFilters({ status: "", search: "", assignee: "", hideCompleted: false })}
            style={{ fontSize: 11, color: "#888", background: "none", border: "none", cursor: "pointer" }}>✕ クリア</button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#888" }}>全 {totalCards} 件</span>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ width: 32, height: 32, border: "3px solid #E6F1FB", borderTopColor: "#378ADD", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13, color: "#888" }}>スプレッドシートからデータを取得中...</span>
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#FCEBEB", border: "1px solid #F7C1C1", borderRadius: 10, padding: "16px 24px", fontSize: 13, color: "#A32D2D", maxWidth: 440, textAlign: "center", lineHeight: 1.7, whiteSpace: "pre-line" }}>
            ⚠️ {error}<br />
            <button onClick={fetchAll} style={{ marginTop: 12, background: "#A32D2D", color: "#fff", border: "none", borderRadius: 6, padding: "6px 16px", fontSize: 12, cursor: "pointer" }}>再試行</button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", overflow: "hidden" }}>
          {CATEGORIES.map((cat, ci) => {
            const allCatCards = filterCards(cards[cat.key]);
            const activeCards = allCatCards.filter(c => c.progress < 100);
            const doneCards   = allCatCards.filter(c => c.progress === 100);
            const overdue     = activeCards.filter(c => c.isOverdue).length;
            return (
              <div key={cat.key} style={{ borderRight: ci < 3 ? "1px solid #E8E6E0" : "none", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #E8E6E0", background: "#fff", display: "flex", alignItems: "center", gap: 8, borderTop: `3px solid ${cat.color}`, flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: cat.light, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{cat.icon}</div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{cat.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: cat.color, color: "#fff" }}>{activeCards.length}</span>
                  {overdue > 0 && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 99, background: "#FCEBEB", color: "#E24B4A", fontWeight: 600 }}>超過{overdue}</span>}
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 7 }}>
                  {activeCards.length === 0 && doneCards.length === 0
                    ? <div style={{ textAlign: "center", color: "#B4B2A9", fontSize: 12, marginTop: 24 }}>対応中のカードはありません</div>
                    : <>
                      {activeCards.map((card, idx) => (
                        <TaskCard key={`active-${idx}`} card={card} category={cat}
                          onClick={(c, cat) => { setSelected(c); setSelCat(cat); }} />
                      ))}
                      {!filters.hideCompleted && (
                        <CompletedSection cards={doneCards} category={cat}
                          onClick={(c, cat) => { setSelected(c); setSelCat(cat); }} />
                      )}
                    </>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedCard && selectedCat && (
        <>
          <div onClick={() => { setSelected(null); setSelCat(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.2)", zIndex: 99 }} />
          <DetailPanel card={selectedCard} category={selectedCat}
            onClose={() => { setSelected(null); setSelCat(null); }}
            onToggleTask={handleToggleTask}
            onEdit={() => { setEditCard(selectedCard); setEditCat(selectedCat); }}
            filterAssignee={filters.assignee}
            onSaveComment={handleSaveComment} />
        </>
      )}

      {editCard && editCat && (
        <>
          <div onClick={() => { setEditCard(null); setEditCat(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.2)", zIndex: 199 }} />
          <EditModal card={editCard} category={editCat}
            onClose={() => { setEditCard(null); setEditCat(null); }}
            onSave={handleSaveEdit} />
        </>
      )}
    </div>
  );
}
