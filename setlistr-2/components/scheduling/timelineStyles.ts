// The Schedule timeline's row styles (components/scheduling/ScheduleTimeline),
// shared with the spreadsheet import review so both use the same rows.
export const TIMELINE_CSS = `
        .tl { font-family: "DM Sans", system-ui, sans-serif; color: var(--sl-text); display: grid; gap: 0; }
        .tl-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 18px; }
        .tl-head h1 { font-size: 26px; font-weight: 800; color: var(--sl-text); margin: 0; letter-spacing: -0.02em; }
        .tl-head p { font-size: 14px; color: var(--sl-text-2); margin: 2px 0 0; }
        .tl-lnk { display: inline-flex; align-items: center; gap: 6px; font: 700 13px "DM Sans", system-ui, sans-serif; color: var(--sl-gold-text); background: none; border: 0; cursor: pointer; padding: 6px 0; min-height: 44px; text-decoration: none; }
        .tl-mono { font-family: "DM Mono", monospace; font-variant-numeric: tabular-nums; }
        .tl-grow { flex: 1; min-width: 0; }
        .tl-sub { display: block; font-size: 12.5px; color: var(--sl-text-3); margin-top: 1px; overflow-wrap: anywhere; }
        .tl-quiet { color: var(--sl-text-3); }
        .tl-active { display: flex; align-items: center; gap: 12px; padding: 14px 16px; margin-bottom: 14px; border-radius: 16px; background: var(--sl-surface); border: 1px solid var(--sl-line); color: var(--sl-text); text-decoration: none; min-height: 64px; }
        .tl-mic { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--sl-accent); color: var(--sl-on-accent); }
        .tl-act-st { display: block; font-size: 12px; font-weight: 700; }
        .tl-act-v { display: block; font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
        .tl-el { font-size: 18px; color: var(--sl-text-2); }
        .tl-start-err { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 10px 14px; border-radius: 10px; font-size: 13px; color: var(--sl-danger); background: color-mix(in srgb, var(--sl-danger) 8%, transparent); border: 1px solid color-mix(in srgb, var(--sl-danger) 25%, transparent); }
        .tl-next { display: grid; gap: 14px; padding: 18px; border-radius: 18px; border: 1px solid color-mix(in srgb, var(--sl-accent) 30%, transparent); background: linear-gradient(165deg, var(--sl-surface-2), var(--sl-surface)); }
        .tl-next.tl-skel { min-height: 150px; background: var(--sl-skeleton); border-color: transparent; }
        .tl-when { font-size: 13px; font-weight: 800; color: var(--sl-gold-text); letter-spacing: 0.02em; }
        .tl-when .tl-mono { color: var(--sl-text-2); font-weight: 500; }
        .tl-venue { font-size: 24px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.15; margin: 4px 0 2px; overflow-wrap: anywhere; }
        .tl-meta { font-size: 13px; color: var(--sl-text-2); margin-top: 2px; }
        .tl-next-acts { display: flex; gap: 8px; align-items: center; }
        .tl-primary { flex: 1; min-height: 48px; padding: 0 18px; border-radius: 12px; border: 0; background: var(--sl-accent); color: var(--sl-on-accent); font: 800 15px "DM Sans", system-ui, sans-serif; cursor: pointer; }
        .tl-primary:disabled { opacity: 0.7; cursor: default; }
        .tl-err { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px 16px; border-radius: 14px; background: var(--sl-surface); border: 1px solid var(--sl-line); font-size: 13px; color: var(--sl-text-2); }
        .tl-empty { padding: 20px; border-radius: 14px; background: var(--sl-surface); border: 1px solid var(--sl-line); text-align: center; font-size: 13.5px; color: var(--sl-text-3); }
        .tl-sec { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 28px 0 8px; }
        .tl-sec h3 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sl-text-3); }
        .tl-sec span { font-size: 12.5px; color: var(--sl-text-3); }
        .tl-rows { border-top: 1px solid var(--sl-line); }
        .tl-row { border-bottom: 1px solid var(--sl-line); }
        .tl-row-btn { width: 100%; text-align: left; background: none; border: 0; color: inherit; font: inherit; cursor: pointer; display: grid; grid-template-columns: 70px minmax(0,1fr) auto; column-gap: 12px; align-items: baseline; padding: 12px 2px; min-height: 52px; }
        .tl-row-btn.tl-static { cursor: default; align-items: center; }
        .tl-row-btn:not(.tl-static):hover { background: var(--sl-hover); }
        .tl-date { font-size: 12.5px; color: var(--sl-text-2); white-space: normal; line-height: 1.35; }
        .tl-static .tl-date { white-space: normal; line-height: 1.35; }
        .tl-main { min-width: 0; }
        .tl-v { display: block; font-size: 15px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
        .tl-right { display: grid; gap: 2px; justify-items: end; text-align: right; }
        .tl-up-r { grid-auto-flow: column; align-items: center; gap: 10px; }
        .tl-state { font-size: 12px; font-weight: 700; white-space: nowrap; }
        .tl-time { font-size: 12.5px; color: var(--sl-text-2); white-space: nowrap; }
        .tl-flag { display: inline-flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 12px; font-weight: 700; color: var(--sl-warn); }
        .tl-flag::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--sl-warn); }
        .tl-month { font-family: var(--sl-font-display); font-size: 22px; letter-spacing: 0.03em; color: var(--sl-text-3); margin: 18px 0 2px; }
        .tl-rows > .tl-month:first-child { margin-top: 10px; }
        .tl-detail { padding: 0 2px 16px 84px; display: grid; gap: 8px; font-size: 13.5px; color: var(--sl-text-2); }
        .tl-dl { margin: 0; display: grid; gap: 8px; }
        .tl-dl dt { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--sl-text-3); }
        .tl-dl dd { margin: 1px 0 0; color: var(--sl-text); }
        .tl-dl .tl-lnk { min-height: 0; padding: 0; }
        .tl-why { margin: 0; font-size: 13px; line-height: 1.45; color: var(--sl-text-2); }
        .tl-why strong { color: var(--sl-text); }
        .tl-pair { display: grid; gap: 4px; padding: 10px 12px; border-radius: 10px; background: var(--sl-surface); border: 1px solid var(--sl-line); }
        .tl-row-acts { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .tl-skel-row { height: 52px; border-bottom: 1px solid var(--sl-line); background: linear-gradient(90deg, transparent 84px, var(--sl-skeleton) 84px, var(--sl-skeleton) 60%, transparent 60%) no-repeat center / 100% 12px; }
        .tl-more { font: 700 14px "DM Sans", system-ui, sans-serif; color: var(--sl-gold-text); background: none; border: 0; padding: 12px 0; min-height: 44px; cursor: pointer; justify-self: start; }
        .tl-note { margin: 6px 0 0; font-size: 13px; color: var(--sl-text-3); }
        .tl-dk { display: none; }
        .tl-lnk:focus-visible, .tl-primary:focus-visible, .tl-row-btn:focus-visible, .tl-more:focus-visible, .tl-active:focus-visible { outline: 2px solid var(--sl-accent); outline-offset: 2px; border-radius: 6px; }
        @media (prefers-reduced-motion: reduce) { .tl * { transition: none !important; } }
        @container sl-frame (min-width: 900px) {
          .tl-next { grid-template-columns: minmax(0,1fr) auto; align-items: end; padding: 22px 24px; }
          .tl-next-acts { min-width: 260px; }
          .tl-venue { font-size: 30px; }
          .tl-row-btn { grid-template-columns: 110px minmax(0,1.4fr) minmax(0,1fr) 170px; }
          .tl-date { white-space: nowrap; }
          .tl-ph { display: none; }
          .tl-dk { display: block; font-size: 14px; color: var(--sl-text-2); overflow-wrap: anywhere; }
          .tl-detail { padding-left: 122px; }
        }
      `
