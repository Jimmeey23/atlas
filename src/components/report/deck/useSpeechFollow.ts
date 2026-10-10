import { useEffect, useRef, useState } from 'react';
import { speechWords, matchSpeech } from '../../../report/presentation-follow';
interface RecognitionResult { isFinal: boolean; [index: number]: { transcript: string } }
interface Recognition { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; abort: () => void }
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function useSpeechFollow({ candidates, current, lines, onMatch, enabled }: { candidates: { key: string; text: string }[]; current: string; lines: string[]; onMatch: (key: string) => void; enabled: boolean }) {
  const [listening, setListening] = useState(false), [status, setStatus] = useState('Microphone off'), [transcript, setTranscript] = useState(''), [interim, setInterim] = useState(''), [activeLine, setActiveLine] = useState(-1);
  const [captures, setCaptures] = useState<Record<string, string>>({});
  const recognition = useRef<Recognition | null>(null), latest = useRef({ candidates, current, lines, onMatch });
  latest.current = { candidates, current, lines, onMatch };
  const lastSwitch = useRef(0);
  const supported = !!((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition);
  useEffect(() => { if (!enabled) setListening(false); }, [enabled]);
  useEffect(() => { setActiveLine(-1); }, [current]);
  useEffect(() => {
    if (!listening || !enabled) return;
    const Constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) { setStatus('Speech recognition unavailable in this browser'); setListening(false); return; }
    let cancelled = false;
    const r = new Constructor(); recognition.current = r; r.lang = 'en-IN'; r.continuous = true; r.interimResults = true;
    r.onresult = event => {
      let pending = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) { const result = event.results[i]; if (result.isFinal) final += result[0].transcript + ' '; else pending += result[0].transcript + ' '; }
      setInterim(pending); setStatus('Listening · following your voice');
      if (final) {
        setTranscript(t => (t + ' ' + final).trim().slice(-12000));
        const state = latest.current;
        const owner = matchSpeech(final, state.candidates, state.current) ?? state.current;
        setCaptures(previous => ({ ...previous, [owner]: ((previous[owner] ?? '') + ' ' + final).trim().slice(-12000) }));
      }
      const spoken = final || pending;
      const state = latest.current;
      const line = matchSpeech(spoken, state.lines.map((text, i) => ({ key: String(i), text })), '');
      if (line != null && speechWords(spoken).length >= 3) setActiveLine(Number(line));
      if (final && Date.now() - lastSwitch.current > 4000) {
        const match = matchSpeech(final, state.candidates, state.current);
        if (match && match !== state.current) { lastSwitch.current = Date.now(); state.onMatch(match); }
      }
    };
    r.onerror = event => { if (cancelled) return; if (event.error === 'no-speech') { setStatus('Listening · waiting for speech'); return; } cancelled = true; setStatus(`Microphone stopped: ${event.error}. Check permission or restart.`); setListening(false); };
    r.onend = () => { if (!cancelled) { try { r.start(); } catch { setListening(false); setStatus('Microphone stopped · restart to continue'); } } };
    try { r.start(); setStatus('Requesting microphone…'); } catch { setListening(false); setStatus('Could not start microphone'); }
    return () => { cancelled = true; r.onend = null; r.onresult = null; r.onerror = null; r.abort(); recognition.current = null; };
  }, [listening, enabled]);
  return { listening: listening && enabled, status: listening ? status : status.startsWith("Microphone stopped") || status.startsWith("Could not") ? status : "Microphone off", transcript, sectionTranscript: captures[current] ?? "", interim, activeLine, supported, toggle: () => setListening(n => !n), clear: () => { setTranscript(''); setCaptures({}); setInterim(''); setActiveLine(-1); } };
}
