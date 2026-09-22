import { useEffect, useRef, useState } from "react";

/**
 * Plays the prompt once on arrival, stops on unmount, and reports playability so a
 * missing mp3 draws no button rather than a dead one.
 *
 * The two failure modes must not be conflated: an `error` event means the file is
 * missing, so hide the button; a rejected `play()` is usually the autoplay policy,
 * and the button is the recovery, so keep it. Hence availability is derived from
 * the last errored url rather than from `canplay`, which would flicker the button
 * in on every slot once the network resolves.
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
