'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

const SONGS = ['Static & Neon', 'Rearview Gold', 'Every Small Town', 'Backroad Sermon', 'Wildfire Heart']

const TOUR = [
  {
    n: '01',
    title: 'Walk in ready.',
    copy: 'Set tonight’s list before you play. Setlistr listens for those first, and catches the rest.',
    src: '/screenshots/setlist-ready.webp',
    alt: 'Setlistr planned setlist screen showing twelve songs ready before a show',
    reverse: false,
  },
  {
    n: '02',
    title: 'Every show, in the books.',
    copy: 'The last note fades and the record is already written — timestamped, verified, yours.',
    src: '/screenshots/show-complete.webp',
    alt: 'Setlistr show complete screen showing a verified eight-song setlist captured live',
    reverse: true,
  },
  {
    n: '03',
    title: 'Proof, not paperwork.',
    copy: 'Verified performances, in the exact form publishers and PROs need. No spreadsheet, no chasing.',
    src: '/screenshots/claim-pipeline.webp',
    alt: 'Setlistr submissions screen showing verified shows ready to claim',
    reverse: false,
  },
  {
    n: '04',
    title: 'The whole career, kept.',
    copy: 'Every city, every venue, every night — building into a record that’s never existed until now.',
    src: '/screenshots/career-map.webp',
    alt: 'Setlistr career map showing verified shows across multiple cities',
    reverse: true,
  },
]

export default function ProductTour() {
  const [confirmed, setConfirmed] = useState(0)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const [visible, setVisible] = useState<boolean[]>(() => TOUR.map(() => false))

  // Capture animation loop
  useEffect(() => {
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      i += 1
      if (i > SONGS.length) {
        timer = setTimeout(() => { i = 0; setConfirmed(0); timer = setTimeout(step, 900) }, 2600)
        return
      }
      setConfirmed(i)
      timer = setTimeout(step, 1100)
    }
    timer = setTimeout(step, 900)
    return () => clearTimeout(timer)
  }, [])

  // Scroll reveal
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const idx = rowRefs.current.findIndex((el) => el === e.target)
        if (idx >= 0 && e.isIntersecting) {
          setVisible((v) => { const nv = [...v]; nv[idx] = true; return nv })
        }
      })
    }, { threshold: 0.2 })
    rowRefs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <>
      <style>{`
        .pt-capture { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; max-width: 1180px; margin: 0 auto; padding: 8px 32px 110px; }
        .pt-eyebrow { font-family: "DM Mono", monospace; font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: rgba(201,168,76,.95); margin-bottom: 18px; display: flex; align-items: center; gap: 10px; }
        .pt-eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: #C9A84C; animation: pt-pulse 2s infinite; }
        @keyframes pt-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.6)} }
        .pt-h2 { font-family: "Bebas Neue", sans-serif; font-size: clamp(38px,5vw,68px); line-height: .98; letter-spacing: .02em; margin-bottom: 20px; }
        .pt-h2 .gold { color: #C9A84C; }
        .pt-lead { font-size: 16px; font-weight: 300; line-height: 1.8; color: rgba(212,209,202,.8); max-width: 400px; }

        .pt-stage { perspective: 1800px; display: flex; justify-content: center; align-items: center; }
        .pt-phone { position: relative; width: 300px; height: 620px; transform-style: preserve-3d; transform: rotateY(-22deg) rotateX(6deg) rotateZ(1deg); animation: pt-float 7s ease-in-out infinite; }
        @keyframes pt-float { 0%,100%{transform:rotateY(-22deg) rotateX(6deg) rotateZ(1deg) translateY(0)} 50%{transform:rotateY(-19deg) rotateX(5deg) rotateZ(1deg) translateY(-14px)} }
        .pt-frame { position: absolute; inset: 0; border-radius: 44px; padding: 10px; background: linear-gradient(150deg,#3a352c 0%,#171410 40%,#0c0a08 70%,#2a251d 100%); box-shadow: 0 60px 120px -30px rgba(0,0,0,.85), 0 0 0 1px rgba(201,168,76,.14), inset 0 1px 2px rgba(255,255,255,.10); }
        .pt-frame::after { content:""; position:absolute; inset:0; border-radius:44px; pointer-events:none; background: linear-gradient(115deg,transparent 30%,rgba(255,255,255,.06) 46%,rgba(255,255,255,.14) 50%,rgba(255,255,255,.04) 56%,transparent 72%); animation: pt-sweep 6s ease-in-out infinite; }
        @keyframes pt-sweep { 0%,100%{opacity:.35;transform:translateX(-6%)} 50%{opacity:.8;transform:translateX(6%)} }
        .pt-screen { position: relative; width: 100%; height: 100%; border-radius: 35px; overflow: hidden; background: #0a0908; display: flex; flex-direction: column; padding: 20px 16px 14px; }

        .pt-sb { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        .pt-venue { font-size:15px; font-weight:700; }
        .pt-meta { display:flex; align-items:center; gap:8px; font-family:"DM Mono",monospace; font-size:12px; }
        .pt-on { color:#34d17a; display:flex; align-items:center; gap:5px; }
        .pt-on .g { width:6px;height:6px;border-radius:50%;background:#34d17a; box-shadow:0 0 8px #34d17a; }
        .pt-count { color:#C9A84C; } .pt-clock { color:rgba(255,255,255,.55); }
        .pt-prog { height:4px; border-radius:4px; background:rgba(255,255,255,.08); overflow:hidden; }
        .pt-bar { height:100%; background:#34d17a; border-radius:4px; box-shadow:0 0 10px rgba(52,209,122,.6); transition:width .6s cubic-bezier(.16,1,.3,1); }
        .pt-cf { font-family:"DM Mono",monospace; font-size:10px; color:rgba(255,255,255,.4); text-align:right; margin-top:6px; margin-bottom:16px; }
        .pt-cf b { color:#34d17a; }
        .pt-orb-wrap { display:flex; justify-content:center; margin:4px 0 16px; }
        .pt-listening { width:140px; height:140px; border-radius:50%; background:radial-gradient(circle at 42% 38%,#f0d074,#C9A84C 60%,#a8882f); display:flex; flex-direction:column; align-items:center; justify-content:center; animation:pt-breathe 2.6s ease-in-out infinite; }
        @keyframes pt-breathe { 0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,.45),0 0 60px 10px rgba(201,168,76,.35); transform:scale(1)} 50%{box-shadow:0 0 0 20px rgba(201,168,76,0),0 0 90px 22px rgba(201,168,76,.55); transform:scale(1.05)} }
        .pt-mic { margin-bottom:6px; display:flex; }
        .pt-ltxt { font-family:"DM Mono",monospace; font-size:10px; letter-spacing:.22em; color:#231d10; }
        .pt-health { text-align:center; margin-bottom:14px; }
        .pt-hl { font-family:"DM Mono",monospace; font-size:9px; letter-spacing:.2em; color:rgba(255,255,255,.35); text-transform:uppercase; margin-bottom:6px; }
        .pt-hs { color:#34d17a; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
        .pt-hs .g { width:6px;height:6px;border-radius:50%;background:#34d17a; }
        .pt-songs { display:flex; flex-direction:column; gap:7px; }
        .pt-song { display:flex; align-items:center; gap:10px; padding:8px 11px; border-radius:11px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.06); opacity:.30; transform:translateX(6px); transition:all .5s cubic-bezier(.16,1,.3,1); }
        .pt-song.on { opacity:1; transform:translateX(0); border-color:rgba(52,209,122,.45); background:rgba(52,209,122,.05); }
        .pt-num { font-family:"DM Mono",monospace; font-size:11px; color:rgba(255,255,255,.3); width:12px; }
        .pt-info { flex:1; } .pt-title { font-size:13px; font-weight:600; }
        .pt-status { font-size:10px; color:rgba(255,255,255,.3); margin-top:1px; }
        .pt-song.on .pt-status { color:#34d17a; }
        .pt-check { width:19px;height:19px;border-radius:50%; border:1.5px solid rgba(255,255,255,.15); display:flex;align-items:center;justify-content:center; font-size:10px; color:transparent; flex-shrink:0; transition:all .4s ease; }
        .pt-song.on .pt-check { border-color:#34d17a; color:#34d17a; box-shadow:0 0 10px rgba(52,209,122,.4); }

        .pt-story { max-width:760px; margin:0 auto; padding:60px 24px 40px; text-align:center; }
        .pt-story h2 { font-family:"Bebas Neue",sans-serif; font-size:clamp(34px,5vw,66px); line-height:1.05; letter-spacing:.02em; margin-bottom:20px; }
        .pt-story h2.gold { color:#C9A84C; margin-bottom:40px; }
        .pt-story p { font-size:clamp(15px,2vw,19px); font-weight:300; color:rgba(212,209,202,.82); line-height:1.8; }

        .pt-tour { max-width:1080px; margin:0 auto; padding:80px 24px 60px; }
        .pt-tour-head { text-align:center; margin-bottom:64px; }
        .pt-tour-head .eb { font-family:"DM Mono",monospace; font-size:11px; letter-spacing:.16em; color:rgba(201,168,76,.95); text-transform:uppercase; margin-bottom:16px; }
        .pt-tour-head h2 { font-family:"Bebas Neue",sans-serif; font-size:clamp(34px,5vw,60px); line-height:1.05; letter-spacing:.02em; }
        .pt-tour-head h2 .gold { color:#C9A84C; }
        .pt-row { display:grid; grid-template-columns:1fr 1fr; gap:56px; align-items:center; padding:64px 0; opacity:0; transform:translateY(40px); transition:opacity 1s cubic-bezier(.16,1,.3,1), transform 1s cubic-bezier(.16,1,.3,1); }
        .pt-row.in { opacity:1; transform:translateY(0); }
        .pt-row.reverse .pt-rcopy { order:2; } .pt-row.reverse .pt-rmedia { order:1; }
        .pt-rn { font-family:"Bebas Neue",sans-serif; font-size:18px; color:rgba(201,168,76,.7); margin-bottom:12px; }
        .pt-rcopy h3 { font-family:"Bebas Neue",sans-serif; font-size:clamp(28px,3.5vw,42px); line-height:1.08; letter-spacing:.02em; margin-bottom:16px; }
        .pt-rcopy p { font-size:15.5px; font-weight:300; line-height:1.8; color:rgba(212,209,202,.8); max-width:420px; }
        .pt-rmedia { display:flex; justify-content:center; perspective:1600px; }
        .pt-rphone { width:250px; border-radius:34px; padding:8px; background:linear-gradient(150deg,#3a352c,#171410 45%,#0c0a08 70%,#2a251d); box-shadow:0 40px 90px -30px rgba(0,0,0,.8), 0 0 0 1px rgba(201,168,76,.12); transform:rotateY(-16deg) rotateX(4deg); position:relative; }
        .pt-row.reverse .pt-rphone { transform:rotateY(16deg) rotateX(4deg); }
        .pt-rphone::after { content:""; position:absolute; inset:0; border-radius:34px; pointer-events:none; background:linear-gradient(115deg,transparent 32%,rgba(255,255,255,.05) 48%,rgba(255,255,255,.12) 51%,transparent 68%); }
        .pt-rphone img { width:100%; border-radius:27px; display:block; }

        @media (max-width: 820px) {
          .pt-capture { grid-template-columns:1fr; gap:44px; text-align:center; padding-bottom:80px; }
          .pt-lead { margin:0 auto; }
          .pt-eyebrow { justify-content:center; }
          .pt-phone { transform:rotateY(-6deg) rotateX(2deg); animation:pt-float-m 8s ease-in-out infinite; }
          @keyframes pt-float-m { 0%,100%{transform:rotateY(-6deg) rotateX(2deg) translateY(0)} 50%{transform:rotateY(-6deg) rotateX(2deg) translateY(-8px)} }
          .pt-row, .pt-row.reverse .pt-rcopy, .pt-row.reverse .pt-rmedia { grid-template-columns:1fr; order:initial; }
          .pt-row { display:flex; flex-direction:column; gap:32px; text-align:center; padding:48px 0; }
          .pt-rcopy p { margin:0 auto; }
          .pt-rphone, .pt-row.reverse .pt-rphone { transform:rotateY(-4deg) rotateX(2deg); width:260px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pt-phone, .pt-frame::after, .pt-listening, .pt-eyebrow .dot { animation: none !important; }
          .pt-row { opacity:1 !important; transform:none !important; }
        }
      `}</style>

      {/* HERO 2: live capture */}
      <section className="pt-capture">
        <div>
          <div className="pt-eyebrow"><span className="dot" /> Live Capture</div>
          <h2 className="pt-h2">Play the show.<br />We&rsquo;ll keep <span className="gold">the record.</span></h2>
          <p className="pt-lead">Every song, confirmed as you play it. No setlist to write up after. You walk off, and it&rsquo;s already done.</p>
        </div>
        <div className="pt-stage">
          <div className="pt-phone">
            <div className="pt-frame">
              <div className="pt-screen">
                <div className="pt-sb">
                  <div className="pt-venue">The Saltbox</div>
                  <div className="pt-meta"><span className="pt-on"><span className="g" />ON</span><span className="pt-count">{confirmed}</span><span className="pt-clock">0:16</span></div>
                </div>
                <div className="pt-prog"><div className="pt-bar" style={{ width: `${(confirmed / 12) * 100}%` }} /></div>
                <div className="pt-cf"><b>{confirmed}</b>/12 confirmed</div>
                <div className="pt-orb-wrap">
                  <div className="pt-listening">
                    <div className="pt-mic">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#231d10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="17" x2="12" y2="21" /><line x1="8.5" y1="21" x2="15.5" y2="21" />
                      </svg>
                    </div>
                    <div className="pt-ltxt">LISTENING</div>
                  </div>
                </div>
                <div className="pt-health"><div className="pt-hl">Session Health</div><div className="pt-hs"><span className="g" /> Capture Stable</div></div>
                <div className="pt-songs">
                  {SONGS.map((s, i) => (
                    <div key={s} className={`pt-song${i < confirmed ? ' on' : ''}`}>
                      <div className="pt-num">{i + 1}</div>
                      <div className="pt-info">
                        <div className="pt-title">{s}</div>
                        <div className="pt-status">{i < confirmed ? 'Verified ✓' : 'Listening…'}</div>
                      </div>
                      <div className="pt-check">&#10003;</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="pt-story">
        <h2>You played the show.</h2>
        <h2 className="gold">Nothing kept the record.</h2>
        <p>The performance happened. The proof didn&rsquo;t.<br />That&rsquo;s the gap Setlistr closes.</p>
      </section>

      {/* PRODUCT TOUR */}
      <section className="pt-tour">
        <div className="pt-tour-head">
          <div className="eb">Inside the Product</div>
          <h2>Everything a show<br /><span className="gold">leaves behind.</span></h2>
        </div>
        {TOUR.map((row, i) => (
          <div
            key={row.n}
            ref={(el) => { rowRefs.current[i] = el }}
            className={`pt-row${row.reverse ? ' reverse' : ''}${visible[i] ? ' in' : ''}`}
          >
            <div className="pt-rcopy">
              <div className="pt-rn">{row.n}</div>
              <h3>{row.title}</h3>
              <p>{row.copy}</p>
            </div>
            <div className="pt-rmedia">
              <div className="pt-rphone">
                <Image src={row.src} alt={row.alt} width={760} height={1647} style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            </div>
          </div>
        ))}
      </section>
    </>
  )
}
