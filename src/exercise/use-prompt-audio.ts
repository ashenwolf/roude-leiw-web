import { useEffect, useRef, useState } from "react";

/**
 * Owns the prompt's <audio> element and reports whether the file is actually
 * playable, so a missing mp3 renders no speaker button at all rather than a
 * control that does nothing.
 *
 * Plays once on arrival and stops on unmount, so audio never bleeds into the
 * next Slot.
 *
 * The two failure modes must not be conflated:
 * - **`error` on the element** — the file is missing or undecodable (audio for
 *   this phrase was never generated, or the R2 sync skipped it). Unavailable:
 *   hide the button.
 * - **`play()` rejecting** — usually the browser's autoplay policy vetoing the
 *   first playback before any user gesture. The file is fine, and the button is
 *   exactly the recovery, so this must NOT hide it.
 *
 * Availability is therefore optimistic: it is derived by comparing the current
 * url against the one that last errored, so only a real `error` event withdraws
 * the button, and a new slot's url is trusted again without an effect having to
 * reset state. Waiting for `canplay` instead would flicker the button in on
 * every slot once the network resolves.
 */
export const usePromptAudio = (url: string | undefined) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (url === undefined) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    const handleError = () => setFailedUrl(url);
    audio.addEventListener("error", handleError);
    audio.play().catch(() => {});
    return () => {
      audio.removeEventListener("error", handleError);
      audio.pause();
      audioRef.current = null;
    };
  }, [url]);

  const play = () => {
    const audio = audioRef.current;
    if (audio === null) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  return { play, isAvailable: url !== undefined && failedUrl !== url };
};
