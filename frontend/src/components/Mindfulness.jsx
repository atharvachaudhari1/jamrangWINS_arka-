/*import React, { useEffect, useRef, useState } from "react";
import Affirmations from "./Affirmations";

const MODES = {
  belly: { label: "Belly breathing", steps: ["Breathe in", "Breathe out"], ms: 4000 },
  box: { label: "Box breathing", steps: ["Inhale 4", "Hold 4", "Exhale 4", "Hold 4"], ms: 4000 },
  guided: { label: "Guided Meditation (audio)", steps: ["Listen & relax"], ms: 60000 },
  sleep: { label: "Sleep breathing", steps: ["Breathe in 4", "Breathe out 6"], ms: 5000 }
};

export default function Mindfulness(){
  const [mode,setMode] = useState("belly");
  const [running,setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const timerRef = useRef();
  const audioRef = useRef();
  const affirmRef = useRef();

  useEffect(()=>{
    function onVisibility(){
      if(document.visibilityState === 'hidden' && running){
        setRunning(false);
        if(affirmRef.current) affirmRef.current.messageForContext('tab-change');
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return ()=> document.removeEventListener('visibilitychange', onVisibility);
  }, [running]);

  useEffect(()=>{
    if(!running){ clearInterval(timerRef.current); if(audioRef.current) audioRef.current.pause(); return; }
    const cfg = MODES[mode];
    if(mode === 'guided'){ if(audioRef.current) audioRef.current.play(); }
    timerRef.current = setInterval(()=>{
      setStep(s => {
        const next = s + 1;
        if(next >= cfg.steps.length){
          if(mode === 'guided'){ setRunning(false); if(affirmRef.current) affirmRef.current.messageForContext('task-complete'); return 0; }
          return 0;
        }
        return next;
      });
    }, cfg.ms);
    return ()=> clearInterval(timerRef.current);
  }, [running, mode]);

  return (
    <div className="app">
      <div className="page-header">
        <h2>Mindfulness</h2>
        <div className="small">Short practices to reset your attention.</div>
      </div>

      <div className="main-grid">
        <div className="card">
          <label className="small">Mode</label>
          <select className="select" value={mode} onChange={e=>setMode(e.target.value)} style={{marginTop:8}}>
            {Object.keys(MODES).map(k => <option key={k} value={k}>{MODES[k].label}</option>)}
          </select>

          <div className="mind-steps" style={{marginTop:18}}>
            {MODES[mode].steps[step % MODES[mode].steps.length]}
          </div>

          {mode === 'guided' && <audio ref={audioRef} controls src="/guided-sample.mp3" />}

          <div style={{marginTop:12}}>
            <button className="btn" onClick={()=>setRunning(true)}>Start</button>
            <button className="btn secondary" onClick={()=>setRunning(false)} style={{marginLeft:8}}>Stop</button>
          </div>
        </div>

        <aside className="card">
          <h4>Affirmation</h4>
          <Affirmations ref={affirmRef} />
        </aside>
      </div>
    </div>
  );
}*/

/*import React, { useEffect, useRef, useState } from "react";
import Affirmations from "./Affirmations";

const MODES = {
  meditation: { 
    label: "Meditation ", 
    audioSrc: "./audio/04_Meditation_for_Working_with_Difficulties.mp3"
  },
  grounding: { 
    label: "Grounding", 
    audioSrc: "./audio/Body-Scan-Meditation.mp3"
  },
  guided: { 
    label: "Sleep meditation", 
    audioSrc: "./audio/Body-Scan-Sleep.mp3"
  }
  
};

export default function Mindfulness(){
  const [mode, setMode] = useState("meditation");
  const [running, setRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef();
  const affirmRef = useRef();

  useEffect(()=>{
    function onVisibility(){
      if(document.visibilityState === 'hidden' && running){
        setRunning(false);
        if(affirmRef.current) affirmRef.current.messageForContext('tab-change');
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return ()=> document.removeEventListener('visibilitychange', onVisibility);
  }, [running]);

  // Load audio duration when mode changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration * 1000); // Convert to ms
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    
    // Trigger load
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [mode]);

  useEffect(()=>{
    if(!running){ 
      if(audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setCurrentTime(0);
      return; 
    }
    
    if(audioRef.current) {
      audioRef.current.play();
      
      const handleAudioEnd = () => {
        setRunning(false);
        if(affirmRef.current) affirmRef.current.messageForContext('task-complete');
      };

      const handleTimeUpdate = () => {
        setCurrentTime(audioRef.current.currentTime * 1000);
      };
      
      audioRef.current.addEventListener('ended', handleAudioEnd);
      audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
      
      return () => {
        if(audioRef.current) {
          audioRef.current.removeEventListener('ended', handleAudioEnd);
          audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        }
      };
    }
  }, [running, mode]);

  // Reset when mode changes
  useEffect(() => {
    setRunning(false);
    setCurrentTime(0);
  }, [mode]);

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app">
      <div className="page-header">
        <h2>Mindfulness</h2>
        <div className="small">Audio-guided practices to reset your attention.</div>
      </div>

      <div className="main-grid">
        <div className="card">
          <label className="small">Mode</label>
          <select 
            className="select" 
            value={mode} 
            onChange={e=>setMode(e.target.value)} 
            style={{marginTop:8}}
            disabled={running}
          >
            {Object.keys(MODES).map(k => <option key={k} value={k}>{MODES[k].label}</option>)}
          </select>

          <div style={{
            marginTop: 24,
            padding: '3rem 1rem',
            textAlign: 'center',
            background: running ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f7f7f7',
            borderRadius: '12px',
            transition: 'all 0.3s ease',
            color: running ? 'white' : '#666'
          }}>
            <div style={{fontSize: '1.2rem', marginBottom: '0.5rem', opacity: 0.9}}>
              {running ? 'Session in progress' : 'Ready to begin'}
            </div>
            <div style={{fontSize: '3rem', fontWeight: 'bold'}}>
              {formatTime(currentTime)}
            </div>
            {duration > 0 && (
              <div style={{fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.8}}>
                of {formatTime(duration)}
              </div>
            )}
          </div>

          <audio 
            ref={audioRef} 
            src={MODES[mode].audioSrc}
            preload="metadata"
            style={{display: 'none'}}
          />

          <div style={{marginTop:16}}>
            <button className="btn" onClick={()=>setRunning(true)} disabled={running}>
              Start
            </button>
            <button className="btn secondary" onClick={()=>setRunning(false)} style={{marginLeft:8}} disabled={!running}>
              Stop
            </button>
          </div>
        </div>

        <aside className="card">
          <h4>Affirmation</h4>
          <Affirmations ref={affirmRef} />
        </aside>
      </div>
    </div>
  );
}*/

import React, { useEffect, useRef, useState } from "react";
import Affirmations from "./Affirmations";

const MODES = {
  meditation: {
    label: "Meditation",
    audioSrc: "/audio/04_Meditation_for_Working_with_Difficulties.mp3"
  },
  grounding: {
    label: "Grounding",
    audioSrc: "/audio/Body-Scan-Meditation.mp3"
  },
  guided: {
    label: "Sleep meditation",
    audioSrc: "/audio/Body-Scan-for-Sleep.mp3"
  }

};

export default function Mindfulness(){
  const [mode, setMode] = useState("meditation");
  const [running, setRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState(null);
  const audioRef = useRef();
  const affirmRef = useRef();

  useEffect(()=>{
    function onVisibility(){
      if(document.visibilityState === 'hidden' && running){
        setRunning(false);
        if(affirmRef.current) affirmRef.current.messageForContext('tab-change');
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return ()=> document.removeEventListener('visibilitychange', onVisibility);
  }, [running]);

  // Load audio duration when mode changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      console.log('Audio loaded successfully, duration:', audio.duration);
      setDuration(audio.duration * 1000);
      setAudioError(null);
    };

    const handleError = (e) => {
      console.error('Audio load error:', e);
      console.error('Audio source:', audio.src);
      console.error('Current URL:', window.location.href);
      setAudioError(`Cannot load audio file. Check if file exists at: ${audio.src}`);
      setRunning(false);
    };

    const handleCanPlay = () => {
      console.log('Audio is ready to play');
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);
    
    // Reset and load
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [mode]);

  useEffect(()=>{
    if(!running){ 
      if(audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setCurrentTime(0);
      return; 
    }
    
    const audio = audioRef.current;
    if(audio) {
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Audio playback started successfully');
          })
          .catch(error => {
            console.error('Playback error:', error);
            setAudioError('Playback failed: ' + error.message);
            setRunning(false);
          });
      }
      
      const handleAudioEnd = () => {
        console.log('Audio ended');
        setRunning(false);
        if(affirmRef.current) affirmRef.current.messageForContext('task-complete');
      };

      const handleTimeUpdate = () => {
        setCurrentTime(audio.currentTime * 1000);
      };
      
      audio.addEventListener('ended', handleAudioEnd);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      
      return () => {
        if(audio) {
          audio.removeEventListener('ended', handleAudioEnd);
          audio.removeEventListener('timeupdate', handleTimeUpdate);
        }
      };
    }
  }, [running, mode]);

  // Reset when mode changes
  useEffect(() => {
    setRunning(false);
    setCurrentTime(0);
    setAudioError(null);
  }, [mode]);

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div>
      <h1 className="page-title">Mindfulness</h1>
      <p className="page-subtitle">Audio-guided practices to reset your attention</p>

      <div className="grid-main">
        <div className="card">
          <div className="text-xs text-muted mb-1">Session type</div>
          <select
            className="select mb-4"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={running}
          >
            {Object.keys(MODES).map((k) => (
              <option key={k} value={k}>{MODES[k].label}</option>
            ))}
          </select>

          {audioError && (
            <div
              style={{
                padding: "10px 14px",
                background: "var(--red-dim)",
                color: "var(--red)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              ⚠️ {audioError}
            </div>
          )}

          <div className={`audio-player ${running ? "playing" : ""}`}>
            <div className="audio-state-label">
              {running ? "Session in progress" : "Ready to begin"}
            </div>
            <div className="audio-time">{formatTime(currentTime)}</div>
            {duration > 0 && (
              <div className="audio-duration">of {formatTime(duration)}</div>
            )}
            <div className="audio-progress">
              <div className="audio-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <audio ref={audioRef} src={MODES[mode].audioSrc} preload="metadata" />

          <div className="flex gap-2 mt-4">
            <button
              className="btn btn-primary"
              onClick={() => setRunning(true)}
              disabled={running || !!audioError}
            >
              ▶ Start
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setRunning(false)}
              disabled={!running}
            >
              ⏹ Stop
            </button>
          </div>
        </div>

        <aside className="stack">
          <div className="card">
            <div className="card-title">Affirmation</div>
            <Affirmations ref={affirmRef} />
          </div>
        </aside>
      </div>
    </div>
  );
}