// The panel's clock, under its name: the time (hours:minutes) and a short date in the panel's language, the full date
// and time zone on hover. Ticks on the minute, and again when the panel is looked at after a while.

/** The clock's three texts for `d` in the panel's language (vi: "Th 4, 01/10", en: "Wed, Oct 1"). */
export function clockText(d: Date, lang: string): { time: string; date: string; full: string } {
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const date = new Intl.DateTimeFormat(locale, lang === 'vi'
    ? { weekday: 'short', day: '2-digit', month: '2-digit' }
    : { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(d);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { time, date, full: `${day} · ${time} · ${zone}` };
}

export function startClock(time: HTMLTimeElement, date: HTMLElement, lang: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    const now = new Date();
    const t = clockText(now, lang);
    time.textContent = t.time;
    time.dateTime = now.toISOString();
    date.textContent = t.date;
    time.parentElement!.title = t.full;
    clearTimeout(timer);
    timer = setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50); // on the next minute
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); }); // timers sleep in a hidden tab
  tick();
}
