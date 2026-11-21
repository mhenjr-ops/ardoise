import { Smartphone } from "lucide-react";
import type { Messages } from "@/lib/i18n/messages";
import { fmt } from "@/lib/i18n/messages-engage";
import { Button } from "@/components/ui";
import { checkIn } from "./actions";

/** The student's "I'm in class" box: type the 6-digit code. */
export function CheckInCard({ t, back, result, course }: { t: Messages; back: string; result?: string; course?: string }) {
  const message =
    result === "present" || result === "late"
      ? { ok: true, text: fmt(t.attendance.checkedIn, { status: t.attendance.statuses[result], course: course ?? "" }) }
      : result === "invalid"
        ? { ok: false, text: t.attendance.invalidCode }
        : result === "too_many"
          ? { ok: false, text: t.attendance.tooMany }
          : null;
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] bg-ardoise text-chalk">
      <div className="flex items-start gap-3 px-5 pt-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ochre-500 text-slate-950">
          <Smartphone size={18} aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">{t.attendance.checkInTitle}</h2>
          <p className="text-[14px] text-chalk/70">{t.attendance.checkInHelp}</p>
        </div>
      </div>
      <form action={checkIn} className="flex gap-2 p-5">
        <input type="hidden" name="back" value={back} />
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          placeholder="000 000"
          aria-label={t.attendance.checkInHelp}
          className="num h-12 min-w-0 flex-1 rounded-[10px] border border-white/15 bg-white/10 px-4 text-center font-display text-2xl tracking-[0.3em] text-chalk placeholder:text-chalk/30 focus:border-ochre-400 focus:outline-none"
        />
        <Button type="submit" variant="accent" size="lg">
          {t.attendance.checkIn}
        </Button>
      </form>
      {message ? (
        <p className={`px-5 pb-4 text-[14.5px] font-semibold ${message.ok ? "text-leaf-100" : "text-ochre-200"}`}>{message.text}</p>
      ) : null}
    </div>
  );
}
