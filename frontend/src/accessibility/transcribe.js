import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// One phrase, sent to the Doorway server on this computer. The server does not keep it.
export async function transcribeWav(wav) {
  const token = localStorage.getItem("accessToken");
  let res;
  try {
    res = await axios.post(`${API}/accessibility/transcribe`, wav, {
      headers: {
        "Content-Type": "audio/wav",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 20000,
      validateStatus: () => true,
    });
  } catch {
    throw new Error("Doorway could not be reached, so the phrase was not recognised. The buttons still work.");
  }
  if (res.status !== 200) throw new Error(res.data?.error || "That phrase could not be recognised. The buttons still work.");
  return { transcript: res.data?.transcript || "" };
}
