import math
import re
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sklearn.ensemble import RandomForestRegressor
import numpy as np

app = FastAPI(title="JumpyBrain ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory per-user trained models
user_models: Dict[str, RandomForestRegressor] = {}

# Categories reflect how an ADHD brain experiences a task, not just its topic.
CATEGORY_KEYWORDS = {
    # Short, low-friction tasks — great for building momentum when dysregulated
    "quick_win": ["reply", "confirm", "check", "pay", "click", "send", "approve", "remind", "ping", "rsvp", "update", "upload", "download", "print", "sign"],
    # Requires sustained attention — only realistic during genuine focus windows
    "deep_focus": ["write", "code", "design", "build", "develop", "program", "draft", "create", "brainstorm", "sketch", "compose", "architect", "plan", "analyze", "debug"],
    # Benefits from a structured environment or body-doubling to sustain attention
    "body_double_friendly": ["read", "study", "learn", "research", "watch", "listen", "understand", "explore", "review", "course", "practice", "revise"],
    # Multi-step bureaucratic tasks ADHD people classically avoid initiating
    "high_initiation": ["form", "tax", "invoice", "register", "submit", "file", "report", "document", "apply", "renew", "insurance", "appointment", "book", "schedule", "fill"],
    # Movement tasks that regulate the ADHD nervous system
    "physical_reset": ["clean", "exercise", "walk", "gym", "organize", "move", "stretch", "tidy", "workout", "run", "setup", "install", "fix", "repair", "buy", "pick", "drop"],
    # Tasks with another person — external accountability helps ADHD follow-through
    "social_accountability": ["meet", "call", "discuss", "present", "interview", "talk", "chat", "feedback", "collaborate", "pair", "zoom", "standup", "sync"],
    # Repetitive low-stimulation tasks — tedious but necessary
    "routine": ["email", "respond", "follow", "log", "track", "enter", "copy", "sort", "label", "tag", "backup", "archive", "record"],
}

# Energy level → category preference (0–1 match score).
# Low energy (1–2): quick wins and movement to regulate; avoid high-initiation.
# Medium energy (3): routine and social tasks with external structure.
# High energy (4–5): deep focus and high-initiation tasks — rare windows, use them.
ENERGY_CATEGORY_MATCH = {
    1: {"quick_win": 1.0, "physical_reset": 0.8, "routine": 0.5, "body_double_friendly": 0.4, "social_accountability": 0.3, "deep_focus": 0.1, "high_initiation": 0.1},
    2: {"quick_win": 0.9, "physical_reset": 0.8, "routine": 0.6, "body_double_friendly": 0.5, "social_accountability": 0.4, "deep_focus": 0.2, "high_initiation": 0.2},
    3: {"quick_win": 0.7, "physical_reset": 0.6, "routine": 0.8, "body_double_friendly": 0.8, "social_accountability": 0.8, "deep_focus": 0.5, "high_initiation": 0.4},
    4: {"quick_win": 0.5, "physical_reset": 0.5, "routine": 0.6, "body_double_friendly": 0.8, "social_accountability": 0.7, "deep_focus": 0.9, "high_initiation": 0.8},
    5: {"quick_win": 0.4, "physical_reset": 0.4, "routine": 0.5, "body_double_friendly": 0.7, "social_accountability": 0.7, "deep_focus": 1.0, "high_initiation": 1.0},
}


def get_task_category(title: str) -> str:
    title_lower = title.lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in title_lower for kw in keywords):
            return cat
    return "high_initiation"


def get_category_energy_match(title: str, energy: int) -> float:
    cat = get_task_category(title)
    energy_int = max(1, min(5, round(energy)))
    prefs = ENERGY_CATEGORY_MATCH.get(energy_int, ENERGY_CATEGORY_MATCH[3])
    return prefs.get(cat, 0.5)


def compute_heuristic_score(task: dict, ctx: dict, history: dict):
    deadline_days = task.get("deadline_days", 30)
    estimate_mins = task.get("estimate_mins", 30)
    dread = task.get("dread_score", 3)
    importance = task.get("importance", 1)
    title = task.get("title", "")

    energy = ctx.get("energy_level", 3)
    hour = ctx.get("hour", 12)

    urgency = math.exp(-max(0, deadline_days) / 10)

    cat_match = get_category_energy_match(title, energy)

    dread_norm = dread / 5.0
    energy_norm = energy / 5.0
    dread_energy_fit = 1.0 - abs(dread_norm - energy_norm) * 0.8

    if 9 <= hour <= 11:
        time_fit = 0.9
    elif 14 <= hour <= 16:
        time_fit = 0.4
    elif hour >= 20:
        time_fit = 0.3
    else:
        time_fit = 0.65

    effort = min(1.0, estimate_mins / 120.0)
    effort_bonus = (1.0 - effort) if energy <= 2 else 0.5

    category = get_task_category(title)
    # High-initiation tasks get a strong boost at peak energy — that's the only realistic window
    high_initiation_boost = 0.15 if (category == "high_initiation" and energy >= 4) else 0.0

    score = (
        urgency * 0.30
        + (importance / 5.0) * 0.20
        + cat_match * 0.15
        + dread_energy_fit * 0.15
        + effort_bonus * 0.10
        + time_fit * 0.10
        + high_initiation_boost
    )
    score = max(0.0, min(1.0, score))

    if urgency > 0.7:
        reason = "Deadline is approaching — time to act"
    elif category == "high_initiation" and energy >= 4:
        reason = "High-energy window — ideal time for tasks you usually avoid"
    elif category == "quick_win" and energy <= 2:
        reason = "Low energy right now — this quick win can help build momentum"
    elif cat_match > 0.8:
        reason = "This task type fits your current energy well"
    elif dread_energy_fit > 0.75:
        reason = "Your energy is right for how difficult this feels"
    elif importance >= 4:
        reason = "You marked this as high importance"
    elif history.get("procrastination_rate", 0) > 0.5:
        reason = "You tend to delay this type — tackling it now while energy is good"
    else:
        reason = "Steady task — good to keep moving"

    return score, reason, category


def build_feature_vector(task: dict, ctx: dict, history: dict) -> list:
    deadline_days = task.get("deadline_days", 30)
    urgency = math.exp(-max(0, deadline_days) / 10)
    estimate = task.get("estimate_mins", 30)
    dread = task.get("dread_score", 3)
    importance = task.get("importance", 1)
    energy = ctx.get("energy_level", 3)
    hour = ctx.get("hour", 12)
    day = ctx.get("day_of_week", 0)
    title = task.get("title", "")

    cat_match = get_category_energy_match(title, energy)
    dread_energy_fit = 1.0 - abs((dread / 5) - (energy / 5)) * 0.8

    return [
        urgency,
        min(1.0, estimate / 120.0),
        dread / 5.0,
        importance / 5.0,
        energy / 5.0,
        hour / 23.0,
        day / 6.0,
        cat_match,
        dread_energy_fit,
        history.get("completion_rate", 0.5),
        history.get("procrastination_rate", 0.3),
    ]


def train_model_from_tasks(completed_tasks: List[dict]) -> Optional[RandomForestRegressor]:
    """Build and fit a per-user model from completed task history.

    Returns None when there isn't enough valid data to train.
    """
    ct = completed_tasks or []
    if len(ct) < 5:
        return None

    late_count = sum(
        1 for t in ct
        if t.get("dueAt") and t.get("completedAt") and str(t["completedAt"]) > str(t["dueAt"])
    )
    history_dict = {
        "completion_rate": min(1.0, len(ct) / max(len(ct) + 5, 1)),
        "procrastination_rate": late_count / len(ct) if ct else 0.3,
    }

    X, y = [], []
    for task in ct:
        if not task.get("completedAt") or not task.get("createdAt"):
            continue
        try:
            created = datetime.fromisoformat(str(task["createdAt"]).replace("Z", "+00:00"))
            completed = datetime.fromisoformat(str(task["completedAt"]).replace("Z", "+00:00"))
            days_taken = max(0.1, (completed - created).total_seconds() / 86400)
        except Exception:
            days_taken = 7

        deadline_days = 30
        if task.get("dueAt"):
            try:
                due = datetime.fromisoformat(str(task["dueAt"]).replace("Z", "+00:00"))
                created_p = datetime.fromisoformat(str(task["createdAt"]).replace("Z", "+00:00"))
                deadline_days = max(0.1, (due - created_p).total_seconds() / 86400)
            except Exception:
                pass

        task_dict = {
            "title": task.get("title", ""),
            "deadline_days": deadline_days,
            "estimate_mins": task.get("estimateMins", 30),
            "dread_score": task.get("dreadScore", 3),
            "importance": task.get("importance", 1),
        }
        ctx = {"energy_level": 3, "hour": 10, "day_of_week": 0}
        features = build_feature_vector(task_dict, ctx, history_dict)
        target = min(1.0, max(0.1, deadline_days / (days_taken * 2 + 0.1)))
        X.append(features)
        y.append(target)

    if len(X) < 5:
        return None

    model = RandomForestRegressor(n_estimators=50, max_depth=5, random_state=42)
    model.fit(X, y)
    model.training_samples_ = len(X)
    return model


# ─── Schemas ─────────────────────────────────────────────────────────────────

class TaskItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(None, alias="_id")
    title: str
    dueAt: Optional[str] = None
    estimateMins: Optional[int] = 30
    importance: Optional[int] = 1
    dreadScore: Optional[int] = 3
    createdAt: Optional[str] = None


class RecommendContext(BaseModel):
    energy_level: Optional[int] = 3
    hour: Optional[int] = None
    day_of_week: Optional[int] = None


class UserHistory(BaseModel):
    completed_tasks: Optional[List[dict]] = []
    total_tasks: Optional[int] = 0
    sessions: Optional[List[dict]] = []
    avg_distraction_count: Optional[float] = 0.0


class RecommendRequest(BaseModel):
    userId: Optional[str] = None
    tasks: List[TaskItem]
    history: Optional[UserHistory] = None
    context: Optional[RecommendContext] = None


class TrainUserRequest(BaseModel):
    userId: str
    completed_tasks: List[dict]
    sessions: Optional[List[dict]] = []


class BrainDumpRequest(BaseModel):
    text: str
    userId: Optional[str] = None


class MindlessSuggestRequest(BaseModel):
    avg_distraction_count: Optional[float] = 0.0
    completion_rate: Optional[float] = 0.5
    energy_level: Optional[int] = 3
    hour: Optional[int] = None
    stress_score: Optional[float] = 0.0


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": len(user_models)}


@app.post("/recommend")
def recommend(req: RecommendRequest):
    context = req.context or RecommendContext()
    hour = context.hour if context.hour is not None else datetime.now().hour
    ctx = {
        "energy_level": context.energy_level or 3,
        "hour": hour,
        "day_of_week": context.day_of_week if context.day_of_week is not None else datetime.now().weekday(),
    }

    history_dict = {"completion_rate": 0.5, "procrastination_rate": 0.3}
    if req.history:
        ct = req.history.completed_tasks or []
        tt = max(req.history.total_tasks or len(ct), 1)
        late_count = sum(
            1 for t in ct
            if t.get("dueAt") and t.get("completedAt") and t["completedAt"] > t["dueAt"]
        )
        history_dict = {
            "completion_rate": len(ct) / tt,
            "procrastination_rate": late_count / len(ct) if ct else 0.3,
            "avg_distraction_count": req.history.avg_distraction_count or 0.0,
        }

    # Task order stays on the rule heuristic. A per-user forest is not fit
    # from a handful of completed tasks; future training should use the
    # recommendation event log once that record is large enough.
    scored = []
    for task in req.tasks:
        deadline_days = 30
        if task.dueAt:
            try:
                due = datetime.fromisoformat(task.dueAt.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                deadline_days = max(0, (due - now).days)
            except Exception:
                pass

        task_dict = {
            "title": task.title,
            "deadline_days": deadline_days,
            "estimate_mins": task.estimateMins or 30,
            "dread_score": task.dreadScore or 3,
            "importance": task.importance or 1,
        }

        score, reason, category = compute_heuristic_score(task_dict, ctx, history_dict)

        priority = "High" if score > 0.65 else ("Low" if score < 0.35 else "Medium")
        scored.append({
            "_id": task.id,
            "title": task.title,
            "score": round(score, 3),
            "priority": priority,
            "reason": reason,
            "category": category,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return {"tasks": scored, "model_used": "heuristic"}


@app.post("/train-user")
def train_user(req: TrainUserRequest):
    if len(req.completed_tasks) < 5:
        return {"status": "skipped", "reason": "Need at least 5 completed tasks to train"}

    model = train_model_from_tasks(req.completed_tasks)
    if model is None:
        return {"status": "skipped", "reason": "Not enough valid task data for training"}

    user_models[req.userId] = model

    feature_names = ["urgency", "effort", "dread", "importance", "energy", "hour", "day", "cat_match", "dread_energy", "completion_rate", "proc_rate"]
    return {
        "status": "trained",
        "training_samples": model.training_samples_,
        "feature_importance": dict(zip(feature_names, [round(float(v), 3) for v in model.feature_importances_])),
    }


@app.post("/analyze-brain-dump")
def analyze_brain_dump(req: BrainDumpRequest):
    text = req.text.lower()

    stress_words = ["stress", "anxious", "anxiety", "overwhelmed", "worried", "panic", "scared", "afraid", "nervous", "deadline", "late", "behind", "fail", "failing", "impossible", "can't", "stuck", "lost"]
    positive_words = ["excited", "happy", "good", "great", "ready", "motivated", "energized", "looking forward", "confident", "calm"]

    stress_count = sum(1 for w in stress_words if w in text)
    positive_count = sum(1 for w in positive_words if w in text)

    stress_score = min(1.0, stress_count / 5)
    if positive_count > stress_count:
        sentiment = "positive"
    elif stress_count > 2:
        sentiment = "stressed"
    else:
        sentiment = "neutral"

    stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "i", "my", "me", "need", "want", "have", "get", "do", "this", "that", "is", "it", "be", "has", "also", "just", "some"}
    words = re.findall(r"\b[a-z]{3,}\b", text)
    word_freq: dict = {}
    for w in words:
        if w not in stop_words:
            word_freq[w] = word_freq.get(w, 0) + 1

    keywords = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]

    if sentiment == "stressed" or stress_score > 0.5:
        insight = "Your brain dump shows signs of high stress. Try a 5-minute grounding exercise before diving into tasks."
    elif sentiment == "positive":
        insight = "You seem energized! Great time to tackle creative or complex tasks."
    else:
        insight = "Your thoughts are captured. Let's turn them into manageable tasks."

    return {
        "stress_score": round(stress_score, 2),
        "sentiment": sentiment,
        "top_keywords": [k for k, _ in keywords[:5]],
        "mindfulness_suggested": stress_score > 0.4 or sentiment == "stressed",
        "insight": insight,
    }


@app.post("/mindfulness-suggest")
def mindfulness_suggest(req: MindlessSuggestRequest):
    hour = req.hour if req.hour is not None else datetime.now().hour
    suggestions = []

    if (req.avg_distraction_count or 0) > 3:
        suggestions.append({
            "type": "grounding",
            "title": "Try a Grounding Exercise",
            "description": f"You've been distracted {req.avg_distraction_count:.0f}+ times recently. A 5-minute grounding exercise can reset your focus.",
            "priority": 0.9,
        })

    if 13 <= hour <= 16 and (req.energy_level or 3) <= 2:
        suggestions.append({
            "type": "meditation",
            "title": "Afternoon Reset Meditation",
            "description": "Your energy is low during the afternoon slump. A short meditation can restore focus.",
            "priority": 0.8,
        })

    if (req.completion_rate or 0.5) < 0.3:
        suggestions.append({
            "type": "breathing",
            "title": "Box Breathing Exercise",
            "description": "It's been a tough session for completing tasks. Two minutes of box breathing can help reset.",
            "priority": 0.7,
        })

    if (req.stress_score or 0) > 0.5:
        suggestions.append({
            "type": "meditation",
            "title": "Stress-Relief Meditation",
            "description": "Your recent notes suggest you might be overwhelmed. A brief meditation can help clear your mind.",
            "priority": 0.85,
        })

    if not suggestions and 8 <= hour <= 10:
        suggestions.append({
            "type": "breathing",
            "title": "Morning Mindfulness Check-in",
            "description": "Start your day with three deep breaths to set a calm, focused intention.",
            "priority": 0.5,
        })

    suggestions.sort(key=lambda x: x["priority"], reverse=True)
    return {
        "suggested": bool(suggestions),
        "top_suggestion": suggestions[0] if suggestions else None,
        "all_suggestions": suggestions,
    }
