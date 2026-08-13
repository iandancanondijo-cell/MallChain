import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';

const QUESTIONS = [
  { q: 'What does a Proof Validator determine?', a: 'Whether a participant genuinely completed a campaign per its rules' },
  { q: 'How many validators review a submission?', a: '15', wrong: ['5', '3', '50'] },
  { q: 'What consensus threshold is required to approve?', a: '80%', wrong: ['50%', '66%', '100%'] },
  { q: 'What happens on a wrong vote?', a: '−0.2 reputation penalty', wrong: ['+0.8 MALL', 'Nothing', 'Stake doubled'] },
  { q: 'What is the matched reward per review?', a: '+0.8 MALL', wrong: ['+1.5 MALL', '+0.2 MALL', '+5 MALL'] },
  { q: 'At which strike tier is the reward multiplier 0.5×?', a: 'Tier 2', wrong: ['Tier 1', 'Tier 5', 'Never'] },
  { q: 'What happens at strike tier 4?', a: 'Stake slashed 25%', wrong: ['Ban', 'Nothing', 'Reward doubled'] },
  { q: 'Can you see other validators\' votes before you vote?', a: 'No — reviews are blind until you vote', wrong: ['Yes, always', 'Only after 10 votes'] },
  { q: 'What is the passing score for the training quiz?', a: '90%', wrong: ['50%', '70%', '100%'] },
  { q: 'What does the integrity warning flag?', a: 'Duplicate or manipulated proofs', wrong: ['Slow reviews', 'High accuracy'] },
];

/** Training — 90% pass quiz with retake (resets score). */
export default function ValidatorsTraining({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const V = st.validators;
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [wrongPick, setWrongPick] = useState('');

  const answer = (val: string) => {
    const q = QUESTIONS[idx];
    const correct = val === q.a;
    setWrongPick(correct ? '' : val);
    if (correct) {
      const s = score + 1;
      if (idx + 1 >= QUESTIONS.length) {
        setScore(s);
        setDone(true);
        V.training = { score: s, passed: s / QUESTIONS.length >= 0.9, attempts: (V.training?.attempts || 0) + 1, ts: new Date().toISOString() };
        store.commit();
        toast(s / QUESTIONS.length >= 0.9 ? `Passed — ${s}/${QUESTIONS.length} (${Math.round((s / QUESTIONS.length) * 100)}%)` : `Failed — ${s}/${QUESTIONS.length}. Retake required.`, s / QUESTIONS.length >= 0.9);
      } else {
        setScore(s);
        setIdx(idx + 1);
        setWrongPick('');
      }
    }
  };

  const retake = () => {
    setIdx(0); setScore(0); setDone(false); setWrongPick('');
    V.training = null;
    store.commit();
    toast('Quiz reset — good luck');
  };

  if (done) {
    const pct = Math.round((score / QUESTIONS.length) * 100);
    const passed = pct >= 90;
    return (
      <div>
        <div className="view-head"><h1>Training result</h1></div>
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ textAlign: 'center', padding: 18 }}>
            <div style={{ fontSize: 46 }}>{passed ? '🎉' : '📚'}</div>
            <h2 style={{ margin: '8px 0' }}>{score}/{QUESTIONS.length} — {pct}%</h2>
            <div className="bar" style={{ maxWidth: 260, margin: '0 auto' }}><i style={{ width: pct + '%', background: passed ? 'var(--green)' : 'var(--red)' }} /></div>
            <p className="muted mt">{passed ? 'You passed the training — proceed to the approval queue.' : 'You need 90% to pass. Review the handbook and retake.'}</p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              {passed ? <button className="btn btn-primary" onClick={() => navigate('/validators/approval')}>Continue →</button> : <button className="btn btn-primary" onClick={retake}>Retake quiz</button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const q = QUESTIONS[idx];
  const opts = q.wrong ? [...q.wrong, q.a].sort(() => Math.random() - 0.5) : [q.a];

  return (
    <div>
      <div className="view-head"><h1>Validator training</h1><span className="sub">Step 4 of 13 — 90% to pass · attempt {(V.training?.attempts || 0) + 1}</span></div>
      <div className="card" style={{ maxWidth: 620 }}>
        <div className="sec-title"><h2>Question {idx + 1} of {QUESTIONS.length}</h2><span className="chip gold">Score {score}</span></div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{q.q}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opts.map((o) => (
            <button key={o} className={'btn btn-ghost'} style={{ justifyContent: 'flex-start' }} onClick={() => answer(o)}>
              {o === wrongPick ? '✕ ' : ''}{o}
            </button>
          ))}
        </div>
        {wrongPick && <div className="mc-err">✕ Incorrect — correct answer: <b>{q.a}</b></div>}
      </div>
    </div>
  );
}
