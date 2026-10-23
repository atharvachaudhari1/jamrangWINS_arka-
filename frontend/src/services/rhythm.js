import api from "./api";

export function recordCheckIn(level) {
  return api.post("/rhythm/checkins", { level }).catch(() => null);
}
