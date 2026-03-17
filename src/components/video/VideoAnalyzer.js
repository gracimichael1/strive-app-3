/**
 * VideoAnalyzer.js — Complete level-aware gymnastics analysis screen.
 * Pulls level/event data from existing src/data/constants.js so there's
 * one source of truth for the full level list including all Xcel tiers.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { LEVELS, WOMEN_EVENTS, MEN_EVENTS, SCORE_BENCHMARKS, LEVEL_SKILLS } from '../../data/constants';
import { analyzeVideo }    from '../../analysis/analysisPipeline';
import { drawSkeleton, drawAngles, drawTimestamp } from '../../overlay/skeletonOverlay';
import SkillTimeline       from '../timeline/SkillTimeline';
import SkillCard           from '../analysis/SkillCard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EVENT_KEY = {
  'Floor Exercise': 'floor', 'Balance Beam': 'beam', 'Uneven Bars': 'bars',
  'Vault': 'vault', 'Pommel Horse': 'pommel', 'Still Rings': 'rings',
  'Parallel Bars': 'parallel_bars', 'High Bar': 'horizontal_bar',
};

function formatTime(s) {
  if (s == null) return '--';
  return `${Math.floor(s/60)}:${(s%60).toFixed(1).padStart(4,'0')}`;
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onFile, disabled }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  return (
    <div
      onDragOver={e=>{e.preventDefault();setDrag(true);}}
      onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f?.type.startsWith('video/'))onFile(f);}}
      onClick={()=>!disabled&&ref.current?.click()}
      style={{
        border:`2px dashed ${drag?'rgba(196,152,42,0.6)':'rgba(255,255,255,0.1)'}`,
        borderRadius:16, padding:'40px 24px', textAlign:'center',
        cursor:disabled?'not-allowed':'pointer', transition:'all 0.25s',
        background:drag?'rgba(196,152,42,0.04)':'rgba(255,255,255,0.02)',
      }}
    >
      <input ref={ref} type="file" accept="video/*" style={{display:'none'}}
        onChange={e=>{const f=e.target.files[0];if(f)onFile(f);}} />
      <div style={{fontSize:36,marginBottom:12}}>🎬</div>
      <div style={{fontSize:16,fontWeight:600,color:'#E2E8F0',marginBottom:6}}>Drop a gymnastics video here</div>
      <div style={{fontSize:12,color:'rgba(255,255,255,0.3)',marginBottom:12}}>MP4 · MOV · WebM</div>
      <div style={{
        margin:'0 auto 20px', maxWidth:320, padding:'10px 14px', borderRadius:10, textAlign:'left',
        background:'rgba(196,152,42,0.06)', border:'1px solid rgba(196,152,42,0.15)',
      }}>
        <div style={{fontSize:11,fontWeight:700,color:'#C4982A',marginBottom:4}}>📷 Single-camera tips</div>
        <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',lineHeight:1.7}}>
          • Film from the side (perpendicular to skill direction)<br/>
          • Keep full body visible throughout<br/>
          • Bright, even lighting — avoid backlighting<br/>
          • 60fps preferred for fast skills
        </div>
      </div>
      <button className="btn-gold" style={{padding:'10px 24px',fontSize:14}}
        onClick={e=>{e.stopPropagation();ref.current?.click();}} disabled={disabled}>
        Select Video
      </button>
    </div>
  );
}

// ─── Athlete Profile Picker ───────────────────────────────────────────────────

function ProfilePicker({ profile, onChange }) {
  const gender  = profile.gender || 'women';
  const events  = gender === 'men' ? MEN_EVENTS : WOMEN_EVENTS;
  const lvlData = LEVELS[gender] || LEVELS.women;
  const allLevels = [
    ...lvlData.compulsory.map(l => ({ label: l, group: 'Compulsory' })),
    ...lvlData.optional.map(l  => ({ label: l, group: 'Optional' })),
    ...(lvlData.xcel || []).map(l => ({ label: l, group: 'Xcel' })),
  ];

  const levelReqs = profile.level && LEVEL_SKILLS[profile.level]
    ? LEVEL_SKILLS[profile.level][EVENT_KEY[profile.eventLabel] || 'floor']
    : null;

  const bench = profile.level ? SCORE_BENCHMARKS[profile.level] : null;

  return (
    <div style={{
      background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)',
      borderRadius:14, padding:16, marginBottom:16,
    }}>
      <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.35)',letterSpacing:1,textTransform:'uppercase',marginBottom:12}}>
        Athlete Profile — Required for accurate AI analysis
      </div>

      {/* Gender */}
      <div style={{display:'flex',gap:8,marginBottom:10}}>
        {['women','men'].map(g => (
          <button key={g} onClick={()=>onChange({...profile,gender:g,level:'',event:'',eventLabel:''})}
            style={{
              flex:1, padding:'8px 0', borderRadius:10, border:'none', cursor:'pointer',
              fontFamily:"'Outfit', sans-serif", fontWeight:600, fontSize:13,
              background: profile.gender===g ? 'rgba(196,152,42,0.15)' : 'rgba(255,255,255,0.04)',
              color: profile.gender===g ? '#C4982A' : 'rgba(255,255,255,0.4)',
              borderBottom: profile.gender===g ? '2px solid #C4982A' : '2px solid transparent',
            }}>
            {g === 'women' ? '👧 Women' : '👦 Men'}
          </button>
        ))}
      </div>

      {/* Level + Event */}
      <div style={{display:'flex',gap:10,marginBottom:10}}>
        <select className="input-field" value={profile.level||''} onChange={e=>onChange({...profile,level:e.target.value})} style={{flex:1}}>
          <option value="">Select Level *</option>
          {['Compulsory','Optional','Xcel'].map(group => {
            const opts = allLevels.filter(l=>l.group===group);
            if (!opts.length) return null;
            return <optgroup key={group} label={`── ${group}`}>
              {opts.map(l=><option key={l.label} value={l.label}>{l.label}</option>)}
            </optgroup>;
          })}
        </select>
        <select className="input-field" value={profile.eventLabel||''} onChange={e=>onChange({...profile,eventLabel:e.target.value,event:EVENT_KEY[e.target.value]||e.target.value.toLowerCase()})} style={{flex:1}}>
          <option value="">Select Event *</option>
          {events.map(ev=><option key={ev} value={ev}>{ev}</option>)}
        </select>
      </div>

      {/* Level requirements preview */}
      {levelReqs && (
        <div style={{padding:'8px 12px',borderRadius:10,background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.15)'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#3B82F6',marginBottom:3,textTransform:'uppercase',letterSpacing:0.5}}>
            {profile.level} {profile.eventLabel} — Required Skills
          </div>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.5)',lineHeight:1.6}}>{levelReqs}</div>
        </div>
      )}

      {/* Score benchmark */}
      {bench && !bench.low?.toString().includes('FIG') && (
        <div style={{marginTop:8,display:'flex',gap:8}}>
          {[['Low',bench.low,'rgba(239,68,68,0.15)','#EF4444'],['Avg',bench.avg,'rgba(245,158,11,0.15)','#F59E0B'],['Top 10%',bench.top10,'rgba(34,197,94,0.15)','#22C55E']].map(([l,v,bg,col])=>(
            <div key={l} style={{flex:1,textAlign:'center',padding:'6px 4px',borderRadius:8,background:bg}}>
              <div style={{fontSize:13,fontWeight:800,color:col,fontFamily:"'Space Mono',monospace"}}>{v}</div>
              <div style={{fontSize:9,color:'rgba(255,255,255,0.3)',textTransform:'uppercase'}}>{l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const STAGES = ['Model','Frames','Poses','Skills','Angles','AI','Done'];

function ProgressBar({ pct, label, stage }) {
  return (
    <div style={{padding:'24px 0'}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
        <span style={{fontSize:13,color:'rgba(255,255,255,0.6)',fontWeight:500}}>{label}</span>
        <span style={{fontSize:12,fontFamily:"'Space Mono',monospace",color:'#C4982A',fontWeight:700}}>{pct}%</span>
      </div>
      <div style={{height:6,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,borderRadius:3,transition:'width 0.4s ease',
          background: stage==='classifying' ? 'linear-gradient(90deg,#3B82F6,#8B5CF6)' : 'linear-gradient(90deg,#9E7C1F,#E8C35A)'}} />
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:12}}>
        {STAGES.map((s,i) => {
          const stagePct = i*(100/(STAGES.length-1));
          const done = pct >= stagePct+3;
          return (
            <div key={s} style={{textAlign:'center'}}>
              <div style={{width:8,height:8,borderRadius:'50%',margin:'0 auto 4px',
                background:done?(stage==='classifying'&&s==='AI'?'#3B82F6':'#C4982A'):'rgba(255,255,255,0.1)',transition:'background 0.3s'}} />
              <div style={{fontSize:9,color:done?'rgba(255,255,255,0.4)':'rgba(255,255,255,0.15)'}}>{s}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Skeleton Canvas ──────────────────────────────────────────────────────────

function SkeletonCanvas({ poseFrame, width, height, showAngles, bio }) {
  const canvasRef = useRef();
  useEffect(() => {
    if (!canvasRef.current || !poseFrame) return;
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    drawSkeleton(ctx, poseFrame.joints, width, height);
    if (showAngles && bio?.peak) drawAngles(ctx, poseFrame.joints, bio.peak, width, height);
    drawTimestamp(ctx, poseFrame.timestamp, width, height);
  }, [poseFrame, width, height, showAngles, bio]);
  return (
    <canvas ref={canvasRef} width={width} height={height}
      style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none'}} />
  );
}

// ─── Confidence Summary ───────────────────────────────────────────────────────

function ConfidenceSummary({ skillAnalysis, athleteProfile }) {
  if (!skillAnalysis?.length) return null;
  const high = skillAnalysis.filter(s=>s.confidenceLabel==='high').length;
  const low  = skillAnalysis.filter(s=>s.confidenceLabel==='low').length;
  const good = high >= skillAnalysis.length * 0.6;
  return (
    <div style={{padding:'10px 14px',borderRadius:12,marginBottom:16,
      background:good?'rgba(34,197,94,0.06)':'rgba(245,158,11,0.06)',
      border:`1px solid ${good?'rgba(34,197,94,0.2)':'rgba(245,158,11,0.2)'}`,
      display:'flex',alignItems:'center',gap:10}}>
      <div style={{fontSize:18}}>{good?'✅':'⚠️'}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:12,fontWeight:600,color:good?'#22C55E':'#F59E0B',marginBottom:2}}>
          {athleteProfile.level && athleteProfile.eventLabel
            ? `${athleteProfile.level} · ${athleteProfile.eventLabel} Analysis`
            : 'Analysis Complete'}
        </div>
        <div style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>
          {high > 0 && `${high} high confidence · `}
          {low  > 0 && `${low} low confidence · `}
          {!good && 'Coach review recommended before sharing'}
        </div>
      </div>
    </div>
  );
}

// ─── Split Angle Banner ───────────────────────────────────────────────────────

function SplitAngleBanner({ skillAnalysis, level }) {
  const leaps = skillAnalysis?.filter(s => s.splitAngleAssessment && s.splitAngleAssessment.required);
  if (!leaps?.length) return null;
  return (
    <div style={{marginBottom:16}}>
      {leaps.map((s,i) => {
        const a = s.splitAngleAssessment;
        const pass = a.meetsRequirement;
        return (
          <div key={i} style={{padding:'8px 14px',borderRadius:10,marginBottom:6,
            background:pass?'rgba(34,197,94,0.06)':'rgba(239,68,68,0.06)',
            border:`1px solid ${pass?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}`,
            display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:16}}>{pass?'✅':'❌'}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:pass?'#22C55E':'#EF4444'}}>
                {s.skillName} — Split Angle
              </div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.45)'}}>
                Estimated: ~{a.estimated ?? '?'}°  |  {level} requires: ≥{a.required}°
                {!pass && a.deduction ? `  |  Deduction: −${a.deduction.toFixed(2)}` : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main VideoAnalyzer ───────────────────────────────────────────────────────

export default function VideoAnalyzer({ onBack }) {
  const videoRef = useRef();
  const [file,           setFile]           = useState(null);
  const [videoURL,       setVideoURL]       = useState(null);
  const [analyzing,      setAnalyzing]      = useState(false);
  const [progress,       setProgress]       = useState({ pct: 0, label: '', stage: '' });
  const [result,         setResult]         = useState(null);
  const [error,          setError]          = useState(null);
  const [selectedSkill,  setSelectedSkill]  = useState(null);
  const [expandedCard,   setExpandedCard]   = useState(0);
  const [currentTime,    setCurrentTime]    = useState(0);
  const [showSkeleton,   setShowSkeleton]   = useState(true);
  const [showAngles,     setShowAngles]     = useState(true);
  const [athleteProfile, setAthleteProfile] = useState({ gender: 'women' });

  const nearestPoseFrame = useCallback(() => {
    if (!result?.poseFrames) return null;
    return result.poseFrames.reduce((b, f) =>
      Math.abs(f.timestamp - currentTime) < Math.abs(b.timestamp - currentTime) ? f : b
    , result.poseFrames[0]);
  }, [result, currentTime]);

  const handleFile = useCallback(f => {
    setFile(f); setVideoURL(URL.createObjectURL(f));
    setResult(null); setError(null); setSelectedSkill(null);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!videoRef.current) return;
    if (!athleteProfile.level || !athleteProfile.event) {
      setError('Please select a level and event before analyzing.');
      return;
    }
    setAnalyzing(true); setError(null); setResult(null);
    try {
      const r = await analyzeVideo(videoRef.current, { athleteProfile, useGemini: true }, p => setProgress(p));
      setResult(r); setSelectedSkill(0); setExpandedCard(0);
    } catch (e) {
      setError(e.message || 'Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }, [athleteProfile]);

  const handleSeek = useCallback(t => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = t;
    videoRef.current.pause();
    setCurrentTime(t);
  }, []);

  const handleSkillSelect = useCallback(idx => {
    setSelectedSkill(idx); setExpandedCard(idx);
    if (result?.skillAnalysis?.[idx]) handleSeek(result.skillAnalysis[idx].peakTimestamp);
  }, [result, handleSeek]);

  const selectedBio = result?.skillAnalysis?.[selectedSkill]?.biomechanics ?? null;
  const poseFrame   = nearestPoseFrame();

  return (
    <div style={{minHeight:'100vh',background:'var(--strive-midnight)',paddingBottom:100,fontFamily:"'Outfit',sans-serif"}}>
      {/* Header */}
      <div style={{padding:'16px 20px 0',display:'flex',alignItems:'center',gap:12}}>
        {onBack && (
          <button onClick={onBack} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8"><path d="M10 3L5 8l5 5"/></svg>
          </button>
        )}
        <div>
          <h1 style={{fontSize:20,fontWeight:800,color:'#E2E8F0',margin:0}}>Motion Analysis</h1>
          <p style={{fontSize:12,color:'rgba(255,255,255,0.35)',margin:0}}>AI pose detection · Gemini skill classification · Level-aware judging</p>
        </div>
      </div>

      <div style={{padding:'16px 20px'}}>

        {/* Upload */}
        {!videoURL && <UploadZone onFile={handleFile} disabled={analyzing} />}

        {/* Video */}
        {videoURL && (
          <div style={{marginBottom:16}}>
            <div style={{position:'relative',background:'#000',borderRadius:14,overflow:'hidden',aspectRatio:'16/9'}}>
              <video ref={videoRef} src={videoURL} controls={!analyzing} playsInline
                onTimeUpdate={()=>setCurrentTime(videoRef.current?.currentTime||0)}
                style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}} />
              {showSkeleton && result && poseFrame && (
                <SkeletonCanvas poseFrame={poseFrame} width={result.frameWidth} height={result.frameHeight} showAngles={showAngles} bio={selectedBio} />
              )}
            </div>
            {result && (
              <div style={{display:'flex',gap:8,marginTop:10}}>
                {[['Skeleton',showSkeleton,()=>setShowSkeleton(v=>!v)],['Angles',showAngles,()=>setShowAngles(v=>!v)]].map(([l,a,fn])=>(
                  <button key={l} onClick={fn} style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'Outfit',sans-serif",border:`1px solid ${a?'rgba(196,152,42,0.4)':'rgba(255,255,255,0.08)'}`,background:a?'rgba(196,152,42,0.1)':'transparent',color:a?'#C4982A':'rgba(255,255,255,0.35)'}}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Profile + Analyze */}
        {videoURL && !result && !analyzing && (
          <>
            <ProfilePicker profile={athleteProfile} onChange={setAthleteProfile} />
            <button className="btn-gold" style={{width:'100%',marginBottom:16}} onClick={handleAnalyze}>
              ⚡ Analyze with AI — {athleteProfile.level && athleteProfile.eventLabel ? `${athleteProfile.level} ${athleteProfile.eventLabel}` : 'Select Level & Event First'}
            </button>
          </>
        )}

        {/* Progress */}
        {analyzing && (
          <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'8px 20px 16px',marginBottom:16}}>
            <ProgressBar pct={progress.pct||0} label={progress.label||'Starting…'} stage={progress.stage} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{padding:'14px 16px',borderRadius:12,marginBottom:16,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',color:'#EF4444',fontSize:14}}>
            ⚠ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* Stats */}
            <div style={{display:'flex',gap:10,marginBottom:16}}>
              {[['Duration',`${result.duration?.toFixed(1)}s`],['Skills',result.skillAnalysis.length],['Frames',result.totalFrames]].map(([l,v])=>(
                <div key={l} style={{flex:1,textAlign:'center',padding:'10px 8px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12}}>
                  <div style={{fontSize:18,fontWeight:800,color:'#C4982A',fontFamily:"'Space Mono',monospace"}}>{v}</div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:0.5}}>{l}</div>
                </div>
              ))}
            </div>

            <ConfidenceSummary skillAnalysis={result.skillAnalysis} athleteProfile={athleteProfile} />
            <SplitAngleBanner skillAnalysis={result.skillAnalysis} level={athleteProfile.level} />

            {/* Timeline */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.35)',letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Skill Timeline</div>
              <SkillTimeline skills={result.skillAnalysis} duration={result.duration} selected={selectedSkill} onSelect={handleSkillSelect} currentTime={currentTime} />
            </div>

            {/* Cards */}
            {result.skillAnalysis.length > 0 ? (
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.35)',letterSpacing:1,textTransform:'uppercase',marginBottom:10}}>Skill Breakdown</div>
                {result.skillAnalysis.map((skill,idx)=>(
                  <SkillCard key={skill.id} skill={skill}
                    expanded={expandedCard===idx}
                    onToggle={()=>setExpandedCard(expandedCard===idx?null:idx)}
                    onSeek={handleSeek} />
                ))}
              </div>
            ) : (
              <div style={{padding:20,textAlign:'center',background:'rgba(255,255,255,0.02)',borderRadius:14,border:'1px solid rgba(255,255,255,0.06)'}}>
                <div style={{fontSize:28,marginBottom:8}}>🤸</div>
                <div style={{fontSize:14,color:'rgba(255,255,255,0.5)'}}>No distinct skills detected. Try a side-view clip with the full body visible.</div>
              </div>
            )}

            <button className="btn-outline" style={{width:'100%',marginTop:16}}
              onClick={()=>{setResult(null);setFile(null);setVideoURL(null);}}>
              Analyze Another Video
            </button>
          </>
        )}
      </div>
    </div>
  );
}
