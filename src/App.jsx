import { useState, useEffect, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const CORE_TASKS = [
  { id: "workout", label: "אימון יומי", icon: "⚡", color: "#FF6B35" },
  { id: "reading", label: "5 עמודים בספר", icon: "📖", color: "#7B2FBE" },
];

const STRICT_TASKS = [
  { id: "diet", label: "תזונה מוגדרת", icon: "🥗", color: "#2DC653" },
];

const DIET_EXTRAS = [
  { id: "walk30", label: "הליכה 30 דק' (אם אכלתי פחמימה)", icon: "🚶" },
];

const WATER_GOAL_ML = 3000;
const WATER_500_COUNT = 6; // six independent 500ml toggles = 3L

const MOTIVATIONAL_QUOTES = [
  "כל יום שאתה לא מוותר הוא ניצחון.",
  "הגוף שלך מסוגל. המוח שלך צריך לשכנע.",
  "75 זה חצי. 100 זה שלם.",
  "אל תחשוב על 100 ימים. חשוב על היום.",
  "אתה לא אותו אדם שהתחיל.",
  "מה שכואב היום מחשל מחר.",
  "בחר את הכאב של משמעת או את הכאב של חרטה.",
];

const STORAGE_KEY = "hundred_days_v2";

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function addDays(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function formatDateHE(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ISO-ish calendar week key: Sunday-start week, keyed by that Sunday's date
function weekKeyOf(iso) {
  const d = new Date(iso);
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  return sunday.toISOString().split("T")[0];
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function emptyDay(date) {
  return {
    date,
    mode: "normal", // "normal" | "vacation"
    status: "open", // "open" | "locked"
    workout: false,
    reading: false,
    water: { checked: false, units500: [false, false, false, false, false, false], unit250: false },
    diet: false,
    dietExtras: { walk30: false },
    alcohol: false,
  };
}

function waterMl(water) {
  if (!water) return 0;
  const from500 = (water.units500 || []).filter(Boolean).length * 500;
  const from250 = water.unit250 ? 250 : 0;
  return from500 + from250;
}

function isWaterDone(water) {
  if (!water) return false;
  return water.checked || waterMl(water) >= WATER_GOAL_ML;
}

function isDaySuccessful(day) {
  if (!day) return false;
  if (day.mode === "vacation") {
    return day.workout && day.reading;
  }
  return day.workout && day.reading && isWaterDone(day.water) && day.diet;
}

/* ---------- Confetti ---------- */
function Confetti() {
  const pieces = useMemo(() => {
    const colors = ["#FF6B35", "#FFB347", "#2DC653", "#00B4D8", "#7B2FBE", "#FFD23F", "#FF3366", "#00FFD1", "#FF9BFF", "#FFF"];
    return Array.from({ length: 200 }, (_, i) => ({
      id: i,
      left: Math.random() * 110 - 5,
      color: colors[i % colors.length],
      delay: Math.random() * 1.2,
      duration: 2.4 + Math.random() * 2.2,
      size: 5 + Math.random() * 12,
      aspect: Math.random() > 0.5 ? 0.4 : 1, // mix rectangles and squares
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 320,
    }));
  }, []);

  return (
    <div style={styles.confettiLayer}>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            top: -20,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * p.aspect,
            background: p.color,
            borderRadius: p.aspect === 1 ? "50%" : 2,
            opacity: 0.92,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------- Modals ---------- */

function VacationModal({ onConfirm, onCancel }) {
  const [step, setStep] = useState(0);
  const [breathDone, setBreathDone] = useState(false);
  const [breathNum, setBreathNum] = useState(1); // which breath, 1-3
  const [phase, setPhase] = useState(null); // "in" | "hold" | "out" | null
  const [breathing, setBreathing] = useState(false);
  const timerRef = useRef(null);

  const steps = [
    { q: "האם אתה בטוח שאתה בחופשה?", sub: "שאלה 1 מתוך 3" },
    { q: "אתה ממש בחופשה? זה לא רק יום עצלות?", sub: "שאלה 2 מתוך 3" },
    { q: "אחרון - אתה 100% בחופשה ומאשר מעבר ל-Vacation Mode?", sub: "שאלה 3 מתוך 3" },
  ];

  const PHASE_DURATIONS = { in: 4000, hold: 1500, out: 5000 };
  const PHASE_LABELS = { in: "שאיפה...", hold: "החזק...", out: "נשיפה איטית..." };
  const PHASE_ICON = { in: "🌬️", hold: "🤐", out: "😮‍💨" };

  const runBreath = (breathIndex) => {
    setBreathNum(breathIndex);
    setPhase("in");
    timerRef.current = setTimeout(() => {
      setPhase("hold");
      timerRef.current = setTimeout(() => {
        setPhase("out");
        timerRef.current = setTimeout(() => {
          if (breathIndex >= 3) {
            setBreathing(false);
            setPhase(null);
            setBreathDone(true);
          } else {
            runBreath(breathIndex + 1);
          }
        }, PHASE_DURATIONS.out);
      }, PHASE_DURATIONS.hold);
    }, PHASE_DURATIONS.in);
  };

  const startBreathing = () => {
    setBreathing(true);
    setBreathDone(false);
    runBreath(1);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (step < 3) {
    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modal}>
          <div style={styles.modalIcon}>🏖️</div>
          <div style={styles.modalSub}>{steps[step].sub}</div>
          <div style={styles.modalQ}>{steps[step].q}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button style={styles.modalNo} onClick={onCancel}>לא, ביטול</button>
            <button style={styles.modalYes} onClick={() => setStep(s => s + 1)}>כן, המשך</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div
          style={{
            ...styles.breathCircle,
            transform: phase === "in" ? "scale(1.25)" : phase === "out" ? "scale(0.85)" : "scale(1)",
            transition: phase === "in"
              ? "transform 4000ms ease-in-out"
              : phase === "out"
                ? "transform 5000ms ease-in-out"
                : "transform 400ms ease",
          }}
        >
          <span style={{ fontSize: 40 }}>{breathing ? PHASE_ICON[phase] : breathDone ? "✅" : "🧘"}</span>
        </div>
        <div style={styles.modalQ}>
          {breathDone
            ? "מעולה. Vacation Mode מופעל ליום הזה."
            : breathing
              ? `נשימה ${breathNum}/3 · ${PHASE_LABELS[phase]}`
              : "קח 3 נשימות עמוקות ואיטיות לפני שאתה מאשר."}
        </div>
        {!breathing && !breathDone && (
          <button style={styles.modalYes} onClick={startBreathing}>התחל נשימות</button>
        )}
        {breathDone && (
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button style={styles.modalNo} onClick={onCancel}>ביטול</button>
            <button style={{ ...styles.modalYes, background: "#2DC653" }} onClick={onConfirm}>אשר Vacation Mode</button>
          </div>
        )}
      </div>
    </div>
  );
}

function AlcoholConfirmModal({ remaining, onConfirm, onCancel }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalIcon}>🍷</div>
        <div style={styles.modalQ}>לסמן חריגת אלכוהול ליום הזה?</div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 8 }}>
          {remaining > 0
            ? `נשארו לך ${remaining} חריגות מתוך 2 השבוע`
            : "זו תהיה החריגה השנייה השבוע"}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button style={styles.modalNo} onClick={onCancel}>ביטול</button>
          <button style={{ ...styles.modalYes, background: "#C9184A" }} onClick={onConfirm}>אשר חריגה</button>
        </div>
      </div>
    </div>
  );
}

function AlcoholLimitModal({ onClose }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalIcon}>🚫</div>
        <div style={styles.modalQ}>ניצלת את 2 חריגות האלכוהול השבוע</div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 8 }}>
          המגבלה מתאפסת ביום ראשון. אופציה: לעבור ל-Vacation Mode להיום, שם אלכוהול חופשי.
        </div>
        <button style={{ ...styles.modalYes, marginTop: 20 }} onClick={onClose}>הבנתי</button>
      </div>
    </div>
  );
}

function WeightModal({ onSave, onClose }) {
  const [val, setVal] = useState("");
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalIcon}>⚖️</div>
        <div style={styles.modalQ}>הזן את המשקל שלך היום</div>
        <input
          type="number"
          step="0.1"
          placeholder="ק״ג"
          value={val}
          onChange={e => setVal(e.target.value)}
          style={styles.weightInput}
          autoFocus
        />
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button style={styles.modalNo} onClick={onClose}>דלג</button>
          <button style={{ ...styles.modalYes, background: "#FF6B35" }} onClick={() => { if (val) { onSave(parseFloat(val)); onClose(); } }}>שמור</button>
        </div>
      </div>
    </div>
  );
}

function LockConfirmModal({ onConfirm, onCancel, allDone }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalIcon}>🔒</div>
        <div style={styles.modalQ}>לנעול את היום ולעבור לבא?</div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 8 }}>
          {allDone
            ? "כל המשימות הושלמו. היום יסומן כהצלחה ולא ניתן לשנות יותר."
            : "לא כל המשימות סומנו - היום ייכנס לטבלה כיום שלא עמדת בו במלואו, ולא ניתן יהיה לשנות אותו יותר."}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button style={styles.modalNo} onClick={onCancel}>ביטול</button>
          <button style={{ ...styles.modalYes, background: allDone ? "#2DC653" : "#FF6B35" }} onClick={onConfirm}>
            נעל ועבור ליום הבא
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetConfirmModal({ dayNum, onConfirm, onCancel }) {
  const [step, setStep] = useState(0);
  const [holdReady, setHoldReady] = useState(false);

  useEffect(() => {
    if (step === 1) {
      setHoldReady(false);
      const t = setTimeout(() => setHoldReady(true), 1800);
      return () => clearTimeout(t);
    }
  }, [step]);

  if (step === 0) {
    return (
      <div style={styles.modalOverlay}>
        <div style={styles.modal}>
          <div style={styles.modalIcon}>⚠️</div>
          <div style={styles.modalQ}>לאפס את האתגר ולהתחיל מיום 1?</div>
          <div style={{ color: "#888", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            אתה נמצא ביום {dayNum} מתוך 100. האיפוס יתחיל ריצה חדשה מיום 1.
            <br />
            ההיסטוריה הנוכחית <b style={{ color: "#FFB347" }}>לא תימחק</b> - היא תישמר בארכיון ותהיה ניתנת לשחזור בכל רגע.
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button style={styles.modalNo} onClick={onCancel}>ביטול</button>
            <button style={{ ...styles.modalYes, background: "#C9184A" }} onClick={() => setStep(1)}>
              המשך לאיפוס
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalIcon}>🔁</div>
        <div style={styles.modalQ}>בטוח-בטוח?</div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
          זו הפעולה האחרונה לפני האיפוס. הריצה הנוכחית (יום 1 עד יום {dayNum}) תעבור לארכיון ה"ריצות הקודמות", ותתחיל ריצה חדשה מיום 1.
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button style={styles.modalNo} onClick={onCancel}>ביטול</button>
          <button
            disabled={!holdReady}
            style={{
              ...styles.modalYes,
              background: holdReady ? "#C9184A" : "#3a1a22",
              color: holdReady ? "#fff" : "#777",
              cursor: holdReady ? "pointer" : "default",
            }}
            onClick={onConfirm}
          >
            {holdReady ? "כן, אפס והתחל מ-0" : "רגע..."}
          </button>
        </div>
      </div>
    </div>
  );
}

function RestoreConfirmModal({ run, onConfirm, onCancel }) {
  const runDayNum = Math.min(
    Math.max(Math.round((new Date(run.activeDate) - new Date(run.startDate)) / 86400000) + 1, 1),
    100
  );
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalIcon}>↩️</div>
        <div style={styles.modalQ}>לשחזר את הריצה הזו?</div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
          תחזור להמשיך מיום {runDayNum}, בדיוק מהמקום שבו עצרת.
          <br />
          הריצה הנוכחית (אם יש בה התקדמות) תישמר בארכיון ולא תאבד.
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button style={styles.modalNo} onClick={onCancel}>ביטול</button>
          <button style={{ ...styles.modalYes, background: "#2DC653" }} onClick={onConfirm}>
            שחזר ריצה זו
          </button>
        </div>
      </div>
    </div>
  );
}

function CarbModal({ onNoCarbs, onYesCarbs }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalIcon}>🥖</div>
        <div style={styles.modalQ}>לא אכלת פחמימה ריקה היום?</div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
          אם אכלת פחמימה - צריך קודם להשלים הליכה 30 דק'.
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button style={{ ...styles.modalYes, background: "#C9184A", flex: 1 }} onClick={onYesCarbs}>כן, אכלתי</button>
          <button style={{ ...styles.modalYes, background: "#2DC653", flex: 1 }} onClick={onNoCarbs}>לא אכלתי</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main App ---------- */

export default function App() {
  const [appState, setAppState] = useState(() => {
    const saved = loadState();
    if (saved) return { archivedRuns: [], ...saved };
    const start = todayISO();
    return {
      startDate: start,
      activeDate: start,
      days: { [start]: emptyDay(start) },
      weights: {},
      archivedRuns: [],
    };
  });

  const [vacationPrompt, setVacationPrompt] = useState(false);
  const [alcoholConfirm, setAlcoholConfirm] = useState(false);
  const [alcoholLimitHit, setAlcoholLimitHit] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [carbModal, setCarbModal] = useState(false);
  const [clickedDayIndex, setClickedDayIndex] = useState(null);
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [startDateInput, setStartDateInput] = useState("");
  const [manualWeightDate, setManualWeightDate] = useState(todayISO());
  const [manualWeightVal, setManualWeightVal] = useState("");

  const activeDate = appState.activeDate;
  const dayNum = useMemo(() => {
    const start = new Date(appState.startDate);
    const cur = new Date(activeDate);
    const diff = Math.round((cur - start) / 86400000);
    return Math.min(Math.max(diff + 1, 1), 100);
  }, [appState.startDate, activeDate]);

  const today = appState.days[activeDate] || emptyDay(activeDate);
  const isLocked = today.status === "locked";
  const isVacation = today.mode === "vacation";

  const quote = MOTIVATIONAL_QUOTES[dayNum % MOTIVATIONAL_QUOTES.length];

  const activeTasks = isVacation ? CORE_TASKS : [...CORE_TASKS, ...STRICT_TASKS];
  const waterDone = isWaterDone(today.water);
  // total "slots" = checkbox tasks + water (water counts as one slot, done when checked or 2.5L reached), skipped in vacation mode
  const totalSlots = activeTasks.length + (isVacation ? 0 : 1);
  const completedToday = activeTasks.filter(t => today[t.id]).length + (isVacation ? 0 : (waterDone ? 1 : 0));
  const allDone = activeTasks.every(t => today[t.id]) && (isVacation || waterDone);

  const currentWeekKey = weekKeyOf(activeDate);
  const alcoholUsedExcludingToday = Object.values(appState.days).filter(
    d => d.alcohol && weekKeyOf(d.date) === currentWeekKey && d.date !== activeDate
  ).length;

  useEffect(() => {
    const week = weekKeyOf(todayISO());
    if (appState.lastWeightPromptWeek !== week && !appState.weights[todayISO()]) {
      const t = setTimeout(() => setShowWeightModal(true), 1200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (updated) => {
    setAppState(updated);
    saveState(updated);
  };

  const saveStartDate = (newStart) => {
    if (!newStart) return;
    persist({ ...appState, startDate: newStart });
    setEditingStartDate(false);
  };

  const updateActiveDay = (patch) => {
    if (isLocked) return;
    const updated = { ...appState };
    updated.days = { ...updated.days, [activeDate]: { ...today, ...patch } };
    persist(updated);
  };

  const toggleTask = (id) => {
    if (id === "diet" && !today.diet) {
      // checking diet (not unchecking) - check if walk30 is already ticked
      const walk30Done = !!today.dietExtras?.walk30;
      if (!walk30Done) {
        setCarbModal(true);
        return;
      }
    }
    updateActiveDay({ [id]: !today[id] });
  };

  // called from carb modal: user said "no carbs" - tick both diet and walk30
  const confirmNoCarbDiet = () => {
    const extras = today.dietExtras || { walk30: false };
    updateActiveDay({ diet: true, dietExtras: { ...extras, walk30: true } });
    setCarbModal(false);
  };

  const EMPTY_WATER = { checked: false, units500: [false, false, false, false, false, false], unit250: false };

  const toggleWaterChecked = () => {
    if (isLocked) return;
    const w = today.water || EMPTY_WATER;
    const newChecked = !w.checked;
    // checking: fill all 6 units; unchecking: clear all units
    const units500 = newChecked ? [true, true, true, true, true, true] : [false, false, false, false, false, false];
    updateActiveDay({ water: { ...w, checked: newChecked, units500 } });
  };

  const toggleWater500 = (index) => {
    if (isLocked) return;
    const w = today.water || EMPTY_WATER;
    const units500 = [...(w.units500 || [false, false, false, false, false, false])];
    units500[index] = !units500[index];
    const allSix = units500.every(Boolean);
    updateActiveDay({ water: { ...w, units500, checked: allSix ? true : w.checked && units500.filter(Boolean).length >= 6 } });
  };

  const toggleWater250 = () => {
    if (isLocked) return;
    const w = today.water || EMPTY_WATER;
    updateActiveDay({ water: { ...w, unit250: !w.unit250 } });
  };

  const toggleDietExtra = (id) => {
    if (isLocked) return;
    const extras = today.dietExtras || { walk30: false };
    updateActiveDay({ dietExtras: { ...extras, [id]: !extras[id] } });
  };

  const handleAlcoholClick = () => {
    if (today.alcohol) {
      updateActiveDay({ alcohol: false });
      return;
    }
    if (!isVacation && alcoholUsedExcludingToday >= 2) {
      setAlcoholLimitHit(true);
      return;
    }
    setAlcoholConfirm(true);
  };

  const confirmAlcohol = () => {
    updateActiveDay({ alcohol: true });
    setAlcoholConfirm(false);
  };

  const enterVacationMode = () => {
    updateActiveDay({ mode: "vacation" });
    setVacationPrompt(false);
  };

  const exitVacationMode = () => {
    updateActiveDay({ mode: "normal" });
  };

  const saveWeight = (w) => {
    const updated = {
      ...appState,
      weights: { ...appState.weights, [todayISO()]: w },
      lastWeightPromptWeek: weekKeyOf(todayISO()),
    };
    persist(updated);
  };

  const saveManualWeight = () => {
    const w = parseFloat(manualWeightVal);
    if (!w || !manualWeightDate) return;
    const updated = { ...appState, weights: { ...appState.weights, [manualWeightDate]: w } };
    persist(updated);
    setManualWeightVal("");
  };

  const performLock = () => {
    const nextDate = addDays(activeDate, 1);
    const updated = { ...appState };
    updated.days = {
      ...updated.days,
      [activeDate]: { ...today, status: "locked" },
    };
    if (!updated.days[nextDate] && dayNum < 100) {
      updated.days[nextDate] = emptyDay(nextDate);
    }
    if (dayNum < 100) {
      updated.activeDate = nextDate;
    }
    persist(updated);
    setLockConfirm(false);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4800);
  };

  const performReset = () => {
    const hasProgress = Object.values(appState.days).some(
      d => d.status === "locked" || d.workout || d.reading || d.diet || d.alcohol || isWaterDone(d.water)
    );
    const start = todayISO();
    const updated = {
      ...appState,
      startDate: start,
      activeDate: start,
      days: { [start]: emptyDay(start) },
      archivedRuns: hasProgress
        ? [{
            id: `${appState.startDate}_${Date.now()}`,
            archivedAt: todayISO(),
            startDate: appState.startDate,
            activeDate: appState.activeDate,
            days: appState.days,
          }, ...(appState.archivedRuns || [])]
        : (appState.archivedRuns || []),
    };
    persist(updated);
    setResetConfirm(false);
  };

  const performRestore = (run) => {
    // Archive the current (possibly fresh) run before restoring, so nothing is lost.
    const currentHasProgress = Object.values(appState.days).some(
      d => d.status === "locked" || d.workout || d.reading || d.diet || d.alcohol || isWaterDone(d.water)
    );
    const archivedCurrent = currentHasProgress
      ? [{
          id: `${appState.startDate}_${Date.now()}`,
          archivedAt: todayISO(),
          startDate: appState.startDate,
          activeDate: appState.activeDate,
          days: appState.days,
        }]
      : [];

    const remainingArchives = (appState.archivedRuns || []).filter(r => r.id !== run.id);

    const updated = {
      ...appState,
      startDate: run.startDate,
      activeDate: run.activeDate,
      days: run.days,
      archivedRuns: [...archivedCurrent, ...remainingArchives],
    };
    persist(updated);
    setRestoreTarget(null);
    setShowArchive(false);
  };

  const weightChartData = Object.entries(appState.weights)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, w]) => ({ date: date.slice(5), weight: w }));

  const allDaysList = useMemo(() => {
    return Array.from({ length: 100 }, (_, i) => {
      const date = addDays(appState.startDate, i);
      return appState.days[date] || null;
    });
  }, [appState.startDate, appState.days]);

  const completedDaysCount = allDaysList.filter(d => d && d.status === "locked" && isDaySuccessful(d)).length;

  const streak = useMemo(() => {
    let cursor = isLocked ? activeDate : addDays(activeDate, -1);
    let count = 0;
    while (true) {
      const d = appState.days[cursor];
      if (!d || d.status !== "locked") break;
      if (!isDaySuccessful(d)) break;
      count++;
      cursor = addDays(cursor, -1);
    }
    return count;
  }, [appState.days, activeDate, isLocked]);

  const progress = (dayNum / 100) * 100;

  return (
    <div style={styles.app} dir="rtl">
      <style>{KEYFRAMES}</style>
      <div style={styles.orb1} />
      <div style={styles.orb2} />
      <div style={styles.orb3} />

      {showConfetti && <Confetti />}

      {vacationPrompt && (
        <VacationModal onConfirm={enterVacationMode} onCancel={() => setVacationPrompt(false)} />
      )}
      {alcoholConfirm && (
        <AlcoholConfirmModal
          remaining={Math.max(0, 2 - alcoholUsedExcludingToday)}
          onConfirm={confirmAlcohol}
          onCancel={() => setAlcoholConfirm(false)}
        />
      )}
      {alcoholLimitHit && <AlcoholLimitModal onClose={() => setAlcoholLimitHit(false)} />}
      {showWeightModal && <WeightModal onSave={saveWeight} onClose={() => setShowWeightModal(false)} />}
      {lockConfirm && (
        <LockConfirmModal allDone={allDone} onConfirm={performLock} onCancel={() => setLockConfirm(false)} />
      )}
      {resetConfirm && (
        <ResetConfirmModal dayNum={dayNum} onConfirm={performReset} onCancel={() => setResetConfirm(false)} />
      )}
      {restoreTarget && (
        <RestoreConfirmModal
          run={restoreTarget}
          onConfirm={() => performRestore(restoreTarget)}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
      {carbModal && (
        <CarbModal
          onNoCarbs={confirmNoCarbDiet}
          onYesCarbs={() => setCarbModal(false)}
        />
      )}

      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>100 Routine Challenge</h1>
        </div>

        <div style={styles.dayCard}>
          {isVacation && <div style={styles.vacationRibbon}>🏖️ VACATION MODE</div>}
          <div style={styles.dayLabel}>יום</div>
          <div style={{ ...styles.dayNumber, color: isVacation ? "#FFB347" : "#FF6B35" }}>{dayNum}</div>
          <div style={styles.dayOf}>מתוך 100</div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%`, background: isVacation ? "linear-gradient(90deg, #FFB347, #FFD23F)" : "linear-gradient(90deg, #FF6B35, #ff9a6c)" }} />
          </div>
          <div style={styles.progressText}>{Math.round(progress)}% הושלם</div>
          {isLocked && <div style={styles.lockedTag}>🔒 יום זה נעול</div>}

          {!editingStartDate ? (
            <button
              style={styles.editStartDateBtn}
              onClick={() => { setStartDateInput(appState.startDate); setEditingStartDate(true); }}
            >
              ✏️ תאריך התחלה: {formatDateHE(appState.startDate)}
            </button>
          ) : (
            <div style={styles.editStartDateRow}>
              <input
                type="date"
                value={startDateInput}
                onChange={e => setStartDateInput(e.target.value)}
                style={styles.dateInput}
              />
              <button style={styles.saveWeightBtn} onClick={() => saveStartDate(startDateInput)}>שמור</button>
              <button style={styles.modalNo} onClick={() => setEditingStartDate(false)}>ביטול</button>
            </div>
          )}
        </div>

        <div style={styles.statsRow}>
          <div style={styles.statBox}>
            <div style={styles.statNum}>{streak}</div>
            <div style={styles.statLabel}>🔥 רצף</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statNum}>{completedDaysCount}</div>
            <div style={styles.statLabel}>✅ ימים שלמים</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statNum}>{100 - dayNum}</div>
            <div style={styles.statLabel}>⏳ נותרו</div>
          </div>
        </div>

        <div style={styles.quoteCard}>
          <span style={styles.quoteIcon}>"</span>
          {quote}
        </div>

        <div style={styles.sectionTitle}>משימות היום</div>
        <div style={styles.tasksCard}>
          {CORE_TASKS.map(task => {
            const checked = !!today[task.id];
            return (
              <div key={task.id} style={styles.taskRow}>
                <div style={styles.taskLeft}>
                  <button
                    disabled={isLocked}
                    style={{
                      ...styles.checkbox,
                      borderColor: checked ? task.color : "#444",
                      background: checked ? task.color : "transparent",
                      cursor: isLocked ? "default" : "pointer",
                      opacity: isLocked ? 0.7 : 1,
                    }}
                    onClick={() => toggleTask(task.id)}
                  >
                    {checked && <span style={styles.checkmark}>✓</span>}
                  </button>
                  <span style={styles.taskIcon}>{task.icon}</span>
                  <span style={{
                    ...styles.taskLabel,
                    textDecoration: checked ? "line-through" : "none",
                    color: checked ? "#666" : "#eee",
                  }}>
                    {task.label}
                  </span>
                </div>
              </div>
            );
          })}

          {!isVacation && (
            <div style={styles.waterRow}>
              <div style={styles.waterHeader}>
                <button
                  disabled={isLocked}
                  style={{
                    ...styles.checkbox,
                    borderColor: waterDone ? "#00B4D8" : "#444",
                    background: today.water?.checked ? "#00B4D8" : "transparent",
                    cursor: isLocked ? "default" : "pointer",
                    opacity: isLocked ? 0.7 : 1,
                  }}
                  onClick={toggleWaterChecked}
                >
                  {today.water?.checked && <span style={styles.checkmark}>✓</span>}
                </button>
                <span style={styles.taskIcon}>💧</span>
                <span style={{
                  ...styles.taskLabel,
                  textDecoration: waterDone ? "line-through" : "none",
                  color: waterDone ? "#666" : "#eee",
                }}>
                  3 ליטר מים
                </span>
                <span style={styles.waterMlReadout}>
                  {waterMl(today.water)} / {WATER_GOAL_ML} מ״ל
                </span>
              </div>

              <div style={styles.waterTapsRow}>
                {Array.from({ length: 6 }, (_, i) => {
                  const filled = !!today.water?.units500?.[i];
                  return (
                    <button
                      key={i}
                      disabled={isLocked}
                      title="500 מ״ל"
                      style={{
                        ...styles.waterUnit,
                        background: filled ? "#00B4D8" : "transparent",
                        borderColor: filled ? "#00B4D8" : "#2a3a4a",
                        opacity: isLocked ? 0.7 : 1,
                      }}
                      onClick={() => toggleWater500(i)}
                    >
                      💧
                    </button>
                  );
                })}
                <button
                  disabled={isLocked}
                  title="250 מ״ל"
                  style={{
                    ...styles.waterUnitSmall,
                    background: today.water?.unit250 ? "#00B4D8" : "transparent",
                    borderColor: today.water?.unit250 ? "#00B4D8" : "#2a3a4a",
                    opacity: isLocked ? 0.7 : 1,
                  }}
                  onClick={toggleWater250}
                >
                  💧
                </button>
              </div>

              <div style={styles.waterMeterBar}>
                <div style={{
                  ...styles.waterMeterFill,
                  width: `${Math.min((waterMl(today.water) / WATER_GOAL_ML) * 100, 100)}%`,
                }} />
              </div>
            </div>
          )}

          {STRICT_TASKS.map(task => {
            const checked = !!today[task.id];
            return (
              <div key={task.id} style={styles.taskRow}>
                <div style={styles.taskLeft}>
                  <button
                    disabled={isLocked}
                    style={{
                      ...styles.checkbox,
                      borderColor: checked ? task.color : "#444",
                      background: checked ? task.color : "transparent",
                      cursor: isLocked ? "default" : "pointer",
                      opacity: isLocked ? 0.7 : 1,
                    }}
                    onClick={() => toggleTask(task.id)}
                  >
                    {checked && <span style={styles.checkmark}>✓</span>}
                  </button>
                  <span style={styles.taskIcon}>{task.icon}</span>
                  <span style={{
                    ...styles.taskLabel,
                    textDecoration: checked ? "line-through" : "none",
                    color: checked ? "#666" : "#eee",
                  }}>
                    {task.label}
                  </span>
                </div>
              </div>
            );
          })}

          {!isVacation && (
            <div style={styles.dietExtrasRow}>
              {DIET_EXTRAS.map(extra => {
                const checked = !!today.dietExtras?.[extra.id];
                return (
                  <button
                    key={extra.id}
                    disabled={isLocked}
                    style={{
                      ...styles.dietExtraChip,
                      borderColor: checked ? "#2DC653" : "#1e2535",
                      background: checked ? "rgba(45,198,83,0.12)" : "#0d1117",
                      opacity: isLocked ? 0.7 : 1,
                    }}
                    onClick={() => toggleDietExtra(extra.id)}
                  >
                    <span style={{
                      ...styles.dietExtraCheck,
                      borderColor: checked ? "#2DC653" : "#444",
                      background: checked ? "#2DC653" : "transparent",
                    }}>
                      {checked && <span style={styles.checkmarkSmall}>✓</span>}
                    </span>
                    <span style={styles.dietExtraIcon}>{extra.icon}</span>
                    <span style={{
                      ...styles.dietExtraLabel,
                      textDecoration: checked ? "line-through" : "none",
                      color: checked ? "#5a8a68" : "#aaa",
                    }}>
                      {extra.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {isVacation && (
            <div style={styles.vacationNote}>
              במצב חופשה: מים ותזונה גמישים, אלכוהול חופשי. אימון וקריאה עדיין נדרשים.
            </div>
          )}

          <div style={styles.taskProgress}>
            <div style={styles.taskProgressBar}>
              <div style={{ ...styles.taskProgressFill, width: `${(completedToday / totalSlots) * 100}%` }} />
            </div>
            <span style={styles.taskProgressText}>{completedToday}/{totalSlots} משימות</span>
          </div>
        </div>

        <div style={styles.controlsRow}>
          <button
            disabled={isLocked}
            style={{
              ...styles.controlBtn,
              background: today.alcohol ? "rgba(201,24,74,0.18)" : "#0d1117",
              borderColor: today.alcohol ? "#C9184A" : "#1e2535",
              opacity: isLocked ? 0.6 : 1,
            }}
            onClick={handleAlcoholClick}
          >
            🍷 {today.alcohol ? "חריגת אלכוהול מסומנת" : "סמן חריגת אלכוהול"}
            {!isVacation && <span style={styles.controlSub}> ({Math.min(alcoholUsedExcludingToday + (today.alcohol ? 1 : 0), 2)}/2 השבוע)</span>}
            {isVacation && <span style={styles.controlSub}> (חופשי בחופשה)</span>}
          </button>

          {!isVacation ? (
            <button
              disabled={isLocked}
              style={{ ...styles.controlBtn, opacity: isLocked ? 0.6 : 1 }}
              onClick={() => setVacationPrompt(true)}
            >
              🏖️ עבור ל-Vacation Mode
            </button>
          ) : (
            <button
              disabled={isLocked}
              style={{ ...styles.controlBtn, borderColor: "#FFB347", color: "#FFB347", opacity: isLocked ? 0.6 : 1 }}
              onClick={exitVacationMode}
            >
              ↩ חזרה למצב רגיל
            </button>
          )}
        </div>

        <button
          disabled={isLocked}
          style={{
            ...styles.lockBtn,
            opacity: isLocked ? 0.5 : 1,
            cursor: isLocked ? "default" : "pointer",
          }}
          onClick={() => setLockConfirm(true)}
        >
          {isLocked ? "🔒 היום הזה נעול" : "🔓 Lock in the Day"}
        </button>

        <div style={styles.sectionTitle}>מעקב משקל</div>
        <div style={styles.weightCard}>
          <div style={styles.weightRow}>
            <input
              type="date"
              value={manualWeightDate}
              onChange={e => setManualWeightDate(e.target.value)}
              style={styles.dateInput}
            />
            <input
              type="number"
              step="0.1"
              placeholder="משקל (ק״ג)"
              value={manualWeightVal}
              onChange={e => setManualWeightVal(e.target.value)}
              style={styles.weightInputInline}
            />
            <button style={styles.saveWeightBtn} onClick={saveManualWeight}>שמור</button>
          </div>
          {weightChartData.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={styles.chartTitle}>גרף ירידה במשקל</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weightChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#666" tick={{ fontSize: 11, fill: "#888" }} />
                  <YAxis stroke="#666" tick={{ fontSize: 11, fill: "#888" }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#eee" }}
                    labelStyle={{ color: "#FF6B35" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="#FF6B35"
                    strokeWidth={2.5}
                    dot={{ fill: "#FF6B35", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {weightChartData.length === 0 && (
            <div style={styles.noWeightMsg}>עוד אין נתוני משקל. הוסף את הראשון! ⚖️</div>
          )}
          <button style={styles.addWeightTodayBtn} onClick={() => setShowWeightModal(true)}>
            + הוסף משקל להיום
          </button>
        </div>

        <div style={styles.sectionTitle}>לוח ימים</div>
        <div style={styles.gridCard}>
          <div style={styles.legendRow}>
            <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#2DC653" }} /> עמדתי</span>
            <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#FFB347" }} /> חופשה</span>
            <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#C9184A" }} /> לא עמדתי</span>
            <span style={styles.legendItem}>🍷 אלכוהול</span>
          </div>
          <div style={styles.dayGrid}>
            {allDaysList.map((d, i) => {
              const dayDate = addDays(appState.startDate, i);
              const isActive = dayDate === activeDate;
              const isFuture = !d;
              const isLockedDay = d && d.status === "locked";
              const success = d && isDaySuccessful(d);

              let bg = "#111";
              let border = "1px solid #222";
              if (isLockedDay) {
                if (d.mode === "vacation") {
                  bg = "#FFB347";
                  border = "none";
                } else if (success) {
                  bg = "#2DC653";
                  border = "none";
                } else {
                  bg = "#C9184A";
                  border = "none";
                }
              } else if (d && !isLockedDay) {
                bg = "#1a1a2a";
              }

              return (
                <div
                  key={i}
                  title={`יום ${i + 1}`}
                  style={{
                    ...styles.gridCell,
                    background: bg,
                    border: isActive ? "2px solid #fff" : border,
                    opacity: isFuture ? 0.35 : 1,
                    position: "relative",
                    cursor: "pointer",
                  }}
                  onClick={() => setClickedDayIndex(clickedDayIndex === i ? null : i)}
                >
                  <span style={styles.gridCellNumber}>{i + 1}</span>
                  {isLockedDay && d.mode === "vacation" && (
                    <span style={styles.gridCellBadge}>🏖</span>
                  )}
                  {d && d.alcohol && (
                    <span style={styles.alcoholDot}>🍷</span>
                  )}
                </div>
              );
            })}
          </div>
          {clickedDayIndex !== null && (
            <div style={styles.dayTooltip}>
              יום {clickedDayIndex + 1} · {formatDateHE(addDays(appState.startDate, clickedDayIndex))}
            </div>
          )}
        </div>

        {appState.archivedRuns && appState.archivedRuns.length > 0 && (
          <>
            <div style={styles.sectionTitle}>ריצות קודמות</div>
            <div style={styles.gridCard}>
              <button
                style={styles.archiveToggleBtn}
                onClick={() => setShowArchive(s => !s)}
              >
                {showArchive ? "הסתר" : `הצג ${appState.archivedRuns.length} ריצות שמורות`} {showArchive ? "▲" : "▼"}
              </button>
              {showArchive && (
                <div style={styles.archiveList}>
                  {appState.archivedRuns.map(run => {
                    const runDayNum = Math.min(
                      Math.max(Math.round((new Date(run.activeDate) - new Date(run.startDate)) / 86400000) + 1, 1),
                      100
                    );
                    const completedInRun = Object.values(run.days).filter(
                      d => d.status === "locked" && isDaySuccessful(d)
                    ).length;
                    return (
                      <div key={run.id} style={styles.archiveItem}>
                        <div>
                          <div style={styles.archiveItemTitle}>התחילה {run.startDate}</div>
                          <div style={styles.archiveItemSub}>
                            נעצרה ביום {runDayNum}/100 · {completedInRun} ימים מוצלחים
                          </div>
                        </div>
                        <button style={styles.archiveRestoreBtn} onClick={() => setRestoreTarget(run)}>
                          שחזר ↩
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <button style={styles.resetBtn} onClick={() => setResetConfirm(true)}>
          🔁 אפס את האתגר והתחל מ-0
        </button>

        <div style={styles.footer}>
          Day {dayNum} · Stay hard 💪
        </div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes confettiFall {
  0% { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) translateX(var(--drift)) rotate(540deg); opacity: 0.3; }
}
`;

const styles = {
  app: {
    minHeight: "100vh",
    background: "#0a0a14",
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  confettiLayer: {
    position: "fixed", inset: 0, zIndex: 200,
    pointerEvents: "none", overflow: "hidden",
  },
  orb1: {
    position: "fixed", top: -100, right: -100,
    width: 400, height: 400, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,107,53,0.15) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  orb2: {
    position: "fixed", bottom: -150, left: -100,
    width: 500, height: 500, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(0,180,216,0.1) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  orb3: {
    position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
    width: 600, height: 600, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(123,47,190,0.05) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  container: {
    maxWidth: 520,
    margin: "0 auto",
    padding: "24px 16px 48px",
    position: "relative",
    zIndex: 1,
  },
  header: { textAlign: "center", marginBottom: 24 },
  badge: {
    display: "inline-block",
    background: "rgba(255,107,53,0.15)",
    border: "1px solid rgba(255,107,53,0.3)",
    color: "#FF6B35",
    fontSize: 11, fontWeight: 700, letterSpacing: 3,
    padding: "4px 14px", borderRadius: 20, marginBottom: 12,
  },
  title: { fontSize: 34, fontWeight: 900, color: "#fff", margin: 0, letterSpacing: -0.5, lineHeight: 1.1 },
  subtitle: { color: "#666", fontSize: 14, letterSpacing: 2, marginTop: 6, textTransform: "uppercase" },
  dayCard: {
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
    border: "1px solid rgba(255,107,53,0.2)",
    borderRadius: 20, padding: "28px 24px", textAlign: "center",
    marginBottom: 16, boxShadow: "0 0 40px rgba(255,107,53,0.05)",
    position: "relative",
  },
  vacationRibbon: {
    position: "absolute", top: -12, right: 20,
    background: "#FFB347", color: "#1a1a2e",
    fontSize: 11, fontWeight: 800, letterSpacing: 1,
    padding: "5px 12px", borderRadius: 10,
    boxShadow: "0 4px 12px rgba(255,179,71,0.4)",
  },
  dayLabel: { color: "#666", fontSize: 12, letterSpacing: 3, textTransform: "uppercase" },
  dayNumber: { fontSize: 88, fontWeight: 900, lineHeight: 1, margin: "4px 0", textShadow: "0 0 40px rgba(255,107,53,0.4)" },
  dayOf: { color: "#555", fontSize: 14 },
  progressBar: { height: 6, background: "#1e1e3a", borderRadius: 6, margin: "16px 0 6px", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 6, transition: "width 0.8s ease" },
  progressText: { color: "#666", fontSize: 12 },
  lockedTag: { marginTop: 10, color: "#888", fontSize: 12, fontWeight: 700 },
  editStartDateBtn: {
    marginTop: 12, background: "transparent", border: "1px solid #2a2a3a",
    color: "#666", fontSize: 11.5, padding: "6px 12px", borderRadius: 10, cursor: "pointer",
  },
  editStartDateRow: {
    marginTop: 12, display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap",
  },
  statsRow: { display: "flex", gap: 10, marginBottom: 16 },
  statBox: { flex: 1, background: "#111827", border: "1px solid #1e2a3a", borderRadius: 14, padding: "14px 10px", textAlign: "center" },
  statNum: { fontSize: 28, fontWeight: 800, color: "#fff" },
  statLabel: { fontSize: 11, color: "#555", marginTop: 2 },
  quoteCard: {
    background: "#0d1117", border: "1px solid #1e2535", borderRadius: 14,
    padding: "16px 20px", color: "#8892b0", fontSize: 14, fontStyle: "italic",
    marginBottom: 20, lineHeight: 1.6, position: "relative",
  },
  quoteIcon: { color: "#FF6B35", fontSize: 28, marginLeft: 6, opacity: 0.6 },
  sectionTitle: { color: "#FF6B35", fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10, marginTop: 4 },
  tasksCard: { background: "#0d1117", border: "1px solid #1e2535", borderRadius: 18, padding: "16px", marginBottom: 14 },
  taskRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #1a1a2a" },
  taskLeft: { display: "flex", alignItems: "center", gap: 12 },
  checkbox: {
    width: 28, height: 28, borderRadius: 8, border: "2px solid #444",
    display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0,
  },
  checkmark: { color: "#fff", fontWeight: 800, fontSize: 16 },
  taskIcon: { fontSize: 20 },
  taskLabel: { fontSize: 15, transition: "all 0.3s" },
  vacationNote: { color: "#FFB347", fontSize: 12, padding: "10px 4px 2px", lineHeight: 1.5 },
  dietExtrasRow: {
    display: "flex", flexDirection: "column", gap: 8,
    padding: "10px 0 12px",
  },
  dietExtraChip: {
    display: "flex", alignItems: "center", gap: 10,
    border: "1px solid #1e2535", borderRadius: 12,
    padding: "9px 12px", cursor: "pointer", textAlign: "right",
    width: "100%", transition: "all 0.2s",
  },
  dietExtraCheck: {
    width: 18, height: 18, borderRadius: 5, border: "2px solid #444",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "all 0.2s",
  },
  checkmarkSmall: { color: "#0a0a14", fontWeight: 800, fontSize: 11 },
  dietExtraIcon: { fontSize: 14 },
  dietExtraLabel: { fontSize: 13, transition: "all 0.3s" },
  waterRow: {
    padding: "14px 0", borderBottom: "1px solid #1a1a2a",
  },
  waterHeader: {
    display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
  },
  waterMlReadout: {
    marginRight: "auto", color: "#00B4D8", fontSize: 12, fontWeight: 700,
  },
  waterSubNote: {
    color: "#555", fontSize: 11.5, marginBottom: 8, paddingRight: 40,
  },
  waterTapsRow: {
    display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap",
  },
  waterUnit: {
    width: 38, height: 38, borderRadius: 10,
    border: "2px solid #2a3a4a", background: "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, cursor: "pointer", transition: "all 0.2s",
  },
  waterUnitSmall: {
    width: 26, height: 38, borderRadius: 10,
    border: "2px solid #2a3a4a", background: "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, cursor: "pointer", transition: "all 0.2s",
    alignSelf: "flex-end",
  },
  waterMeterBar: {
    height: 6, background: "#10202a", borderRadius: 6, overflow: "hidden",
  },
  waterMeterFill: {
    height: "100%", borderRadius: 6,
    background: "linear-gradient(90deg, #00B4D8, #6fe0ff)",
    transition: "width 0.4s ease",
  },
  taskProgress: { display: "flex", alignItems: "center", gap: 10, paddingTop: 12, marginTop: 4 },
  taskProgressBar: { flex: 1, height: 4, background: "#1e1e3a", borderRadius: 4, overflow: "hidden" },
  taskProgressFill: { height: "100%", background: "linear-gradient(90deg, #FF6B35, #FFB347)", borderRadius: 4, transition: "width 0.5s" },
  taskProgressText: { color: "#555", fontSize: 12, whiteSpace: "nowrap" },
  controlsRow: { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" },
  controlBtn: {
    flex: "1 1 220px", background: "#0d1117", border: "1px solid #1e2535",
    color: "#aaa", fontSize: 13, fontWeight: 600,
    padding: "12px 14px", borderRadius: 14, cursor: "pointer", textAlign: "center",
  },
  controlSub: { color: "#555", fontSize: 11 },
  lockBtn: {
    width: "100%", background: "linear-gradient(135deg, #FF6B35, #ff9a6c)",
    border: "none", color: "#1a1a2e", fontWeight: 800, fontSize: 15,
    padding: "16px", borderRadius: 16, marginBottom: 24,
    boxShadow: "0 8px 24px rgba(255,107,53,0.25)",
  },
  weightCard: { background: "#0d1117", border: "1px solid #1e2535", borderRadius: 18, padding: "16px", marginBottom: 20 },
  weightRow: { display: "flex", gap: 8, alignItems: "center" },
  dateInput: { background: "#111", border: "1px solid #2a2a3a", borderRadius: 10, color: "#aaa", fontSize: 13, padding: "8px 10px", flex: 1 },
  weightInputInline: { background: "#111", border: "1px solid #2a2a3a", borderRadius: 10, color: "#eee", fontSize: 14, padding: "8px 12px", width: 100, textAlign: "center" },
  saveWeightBtn: { background: "#FF6B35", border: "none", color: "#fff", fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 10, cursor: "pointer" },
  chartTitle: { color: "#555", fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  noWeightMsg: { color: "#444", fontSize: 13, textAlign: "center", padding: "16px 0" },
  addWeightTodayBtn: { marginTop: 14, width: "100%", background: "transparent", border: "1px dashed #2a2a3a", color: "#555", fontSize: 13, padding: "10px", borderRadius: 10, cursor: "pointer" },
  gridCard: { background: "#0d1117", border: "1px solid #1e2535", borderRadius: 18, padding: "16px", marginBottom: 24 },
  legendRow: { display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, fontSize: 11, color: "#777" },
  legendItem: { display: "flex", alignItems: "center", gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 3, display: "inline-block" },
  dayGrid: { display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 5 },
  dayTooltip: {
    marginTop: 10, textAlign: "center",
    color: "#00B4D8", fontSize: 12, fontWeight: 700,
    letterSpacing: 1,
  },
  gridCell: {
    aspectRatio: "1", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 9, color: "#fff", fontWeight: 700, cursor: "default", transition: "all 0.2s",
  },
  gridCellNumber: {
    fontSize: 10, fontWeight: 700, color: "#fff", opacity: 0.9,
  },
  gridCellBadge: {
    position: "absolute", top: -3, left: -3, fontSize: 8,
    background: "#0a0a14", borderRadius: "50%", lineHeight: 1, padding: 1,
  },
  alcoholDot: {
    position: "absolute", bottom: -3, right: -3, fontSize: 8,
    background: "#0a0a14", borderRadius: "50%", lineHeight: 1, padding: 1,
  },
  archiveToggleBtn: {
    width: "100%", background: "transparent", border: "1px solid #1e2535",
    color: "#888", fontSize: 13, fontWeight: 600,
    padding: "10px", borderRadius: 12, cursor: "pointer",
  },
  archiveList: { marginTop: 12, display: "flex", flexDirection: "column", gap: 8 },
  archiveItem: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#111827", border: "1px solid #1e2a3a", borderRadius: 12,
    padding: "10px 14px",
  },
  archiveItemTitle: { color: "#ddd", fontSize: 13, fontWeight: 700 },
  archiveItemSub: { color: "#666", fontSize: 11.5, marginTop: 2 },
  archiveRestoreBtn: {
    background: "rgba(45,198,83,0.12)", border: "1px solid rgba(45,198,83,0.3)",
    color: "#2DC653", fontSize: 12, fontWeight: 700,
    padding: "7px 14px", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap",
  },
  resetBtn: {
    width: "100%", background: "transparent",
    border: "1px solid rgba(201,24,74,0.3)",
    color: "#C9184A", fontSize: 13, fontWeight: 700,
    padding: "14px", borderRadius: 14, marginBottom: 20, cursor: "pointer",
  },
  footer: { textAlign: "center", color: "#333", fontSize: 12, letterSpacing: 2, marginTop: 8 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modal: {
    background: "#0d1117", border: "1px solid rgba(255,107,53,0.3)", borderRadius: 20,
    padding: "32px 28px", maxWidth: 380, width: "100%", textAlign: "center",
    boxShadow: "0 0 60px rgba(255,107,53,0.15)",
  },
  modalIcon: { fontSize: 48, marginBottom: 12 },
  breathCircle: {
    width: 90, height: 90, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,107,53,0.25), rgba(255,107,53,0.05))",
    border: "1px solid rgba(255,107,53,0.3)",
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 18px",
  },
  modalSub: { color: "#FF6B35", fontSize: 11, letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" },
  modalQ: { color: "#eee", fontSize: 17, fontWeight: 600, lineHeight: 1.5 },
  modalNo: { flex: 1, background: "#1a1a2e", border: "1px solid #333", color: "#777", padding: "12px 20px", borderRadius: 12, fontSize: 14, cursor: "pointer" },
  modalYes: { flex: 1, background: "#FF6B35", border: "none", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" },
  weightInput: { background: "#111", border: "1px solid #2a2a3a", borderRadius: 12, color: "#eee", fontSize: 22, padding: "12px 20px", width: "100%", marginTop: 16, textAlign: "center", boxSizing: "border-box" },
};
