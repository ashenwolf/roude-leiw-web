import { ImageIcon } from "./icons";

import type { LessonImageView } from "../exercise/lesson-image";

// The lesson photo a picture-description sub-lesson is about. Two sizes because
// two render sites: `thumb` on the exam theme path node, `full` above the exercise
// for a whole Session.
//
// A missing photo renders a captioned placeholder rather than nothing — the
// caption is `@image-alt`. See src/exercise/lesson-image.ts for why.
type LessonImageProps = {
  view: LessonImageView;
  size?: "thumb" | "full";
};

// `full` deliberately bleeds past the px-6 on <main> (AppWrapper) so the photo
// spans the phone frame edge to edge — the photo *is* the task, so it gets every
// horizontal pixel available. The -mx-6 / +3rem pair mirrors that padding: if
// <main>'s px-6 changes, change these together. No rounding at full bleed —
// rounded corners against the frame edge read as a rendering glitch.
//
// aspect-video is the 16:9 landscape box; `object-cover` center-crops a photo of
// any ratio into it (object-position defaults to center), and the placeholder
// centers its own contents via flex.
//
// `max-w-none` on `full` is load-bearing, not decoration: Tailwind's preflight
// sets `img { max-width: 100% }`, which silently clamped the +3rem bleed back to
// the content box (measured 380px instead of 428px) — and only for the photo, not
// the placeholder <div>, so the two sizes disagreed. Don't drop it.
const SIZES = {
  thumb: { frame: "w-12 h-12 rounded-lg border-2", icon: "w-5 h-5", caption: "hidden" },
  full: {
    frame: "w-[calc(100%+3rem)] max-w-none -mx-6 aspect-video border-y-2",
    icon: "w-8 h-8",
    caption: "",
  },
} as const;

export const LessonImage = ({ view, size = "full" }: LessonImageProps) => {
  const s = SIZES[size];

  if (view.kind === "photo") {
    return (
      <img
        src={view.src}
        alt={view.alt}
        // Photos are decorative-adjacent but load-bearing for the task, so no
        // lazy-loading on the full size: the learner needs it immediately.
        loading={size === "thumb" ? "lazy" : "eager"}
        className={`${s.frame} object-cover border-gray-200 bg-gray-100 shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${s.frame} flex flex-col items-center justify-center gap-2 p-3 shrink-0 border-dashed border-gray-300 bg-gray-50`}
    >
      <ImageIcon className={`${s.icon} text-gray-400`} />
      <span className={`${s.caption} text-xs text-gray-500 text-center leading-snug`}>
        {view.caption}
      </span>
    </div>
  );
};
