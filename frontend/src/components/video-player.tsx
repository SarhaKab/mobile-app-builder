import Ionicons from "@react-native-vector-icons/ionicons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Level, loadMedia, Media } from "@/src/home";
import { useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;

/**
 * Lecteur d'une vidéo du stockage privé KFIT.
 * Version guidée (niveau + langue de l'utilisateur) : voix, musique, sous-titres (incrustés dans l'image et repris
 * sous la vidéo) et minuteur interactif des séries et des repos. Sinon, la démonstration muette tourne en boucle.
 */
export function VideoPlayer({ path, title, level }: { path: string | null | undefined; title?: string; level?: Level | null }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const [media, setMedia] = useState<Media | null>(null);
  const [failed, setFailed] = useState(false);
  const [subtitles, setSubtitles] = useState(true);
  const [extra, setExtra] = useState(0); // secondes de repos ajoutées par l'utilisateur (vidéo en pause)

  useEffect(() => {
    let live = true;
    setMedia(null); setFailed(false); setExtra(0);
    if (path) loadMedia(path, lang, level).then((m) => live && setMedia(m)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [path, lang, level]);

  const guided = !!media?.cues;
  const player = useVideoPlayer(media?.url ?? null, (p) => { p.timeUpdateEventInterval = 0.25; });
  useEffect(() => { player.loop = !guided; player.muted = !guided; }, [player, guided, media]);
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => { if (status === "error") setFailed(true); });
    return () => sub.remove();
  }, [player]);
  const time = useEvent(player, "timeUpdate")?.currentTime ?? 0;
  const cue = media?.cues?.find((c) => time >= c.start && time <= c.end + 0.3);
  const segment = media?.segments.find((x) => time >= x.start && time < x.end);

  // Repos prolongé : la vidéo est en pause pendant le décompte supplémentaire, puis reprend seule.
  useEffect(() => {
    if (extra <= 0) return;
    const id = setTimeout(() => { if (extra === 1) player.play(); setExtra(extra - 1); }, 1000);
    return () => clearTimeout(id);
  }, [extra, player]);
  const addRest = () => { player.pause(); setExtra(extra + 15); };
  // « Passer » saute à l'annonce de la série suivante (les 5 dernières secondes du repos).
  const skipRest = () => { if (segment) { setExtra(0); player.currentTime = Math.max(time, segment.end - 5); player.play(); } };

  if (!path || failed) {
    return (
      <View style={s.box} testID="video-unavailable">
        <Ionicons name="videocam-off-outline" size={32} color={colors.muted} />
        <Text style={s.text}>{t(failed ? "videoError" : "videoUnavailable")}</Text>
      </View>
    );
  }
  if (!media) return <View style={s.box}><ActivityIndicator color={colors.brandPrimary} /></View>;
  const left = segment ? Math.ceil(segment.end - time) + extra : 0;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={s.frame} testID="video-player" accessible accessibilityLabel={[t(guided ? "videoNarrated" : "videoSilent"), title].filter(Boolean).join(" — ")}>
        <VideoView player={player} style={s.video} nativeControls contentFit="contain" />
      </View>
      {guided ? (
        <>
          {segment && (
            <View style={[s.timer, segment.type === "rest" && s.timerRest]} testID={`video-timer-${segment.type}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.timerLabel}>{segment.type === "rest" ? t("restTimer") : `${t("setLabel")} ${segment.set}/${segment.sets}`}</Text>
                <Text style={s.timerValue} testID="video-timer-value">{clock(left)}</Text>
              </View>
              {segment.type === "rest" && (
                <>
                  <Pressable testID="video-rest-add" onPress={addRest} style={s.timerBtn} accessibilityRole="button" accessibilityLabel={t("restAdd")}>
                    <Text style={s.timerBtnText}>+15 s</Text>
                  </Pressable>
                  <Pressable testID="video-rest-skip" onPress={skipRest} style={[s.timerBtn, s.timerBtnMain]} accessibilityRole="button">
                    <Text style={[s.timerBtnText, { color: colors.onBrandPrimary }]}>{t("restSkip")}</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
          {subtitles && (
            <View style={s.captions} testID="video-subtitles">
              <Text style={s.captionText}>{cue?.text ?? (time > 0 ? " " : t("subtitlesHint"))}</Text>
            </View>
          )}
          <Pressable testID="video-subtitles-toggle" onPress={() => setSubtitles(!subtitles)} style={s.toggle} hitSlop={8}
            accessibilityRole="switch" aria-checked={subtitles} accessibilityState={{ checked: subtitles }} accessibilityLabel={t("subtitles")}>
            <Ionicons name={subtitles ? "chatbox-ellipses" : "chatbox-ellipses-outline"} size={18} color={subtitles ? colors.brandPrimary : colors.muted} />
            <Text style={[s.toggleText, subtitles && { color: colors.brandPrimary }]}>{t("subtitles")}</Text>
          </Pressable>
        </>
      ) : <Text style={s.text} testID="video-silent-note">{t("videoSilent")}</Text>}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  box: { aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.md },
  text: { color: c.muted, fontSize: 13, textAlign: "center" },
  frame: { aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceSecondary },
  video: { width: "100%", height: "100%" },
  timer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  timerRest: { borderWidth: 1, borderColor: c.brandPrimary },
  timerLabel: { color: c.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" },
  timerValue: { color: c.onSurface, fontSize: 32, fontWeight: "700", fontVariant: ["tabular-nums"] },
  timerBtn: { minHeight: 44, minWidth: 64, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  timerBtnMain: { backgroundColor: c.brandPrimary },
  timerBtnText: { color: c.onSurface, fontSize: 14, fontWeight: "700" },
  captions: { minHeight: 76, justifyContent: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  captionText: { color: c.onSurface, fontSize: 17, lineHeight: 24, fontWeight: "600", textAlign: "center" },
  toggle: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 6, minHeight: 44, paddingHorizontal: spacing.md },
  toggleText: { color: c.muted, fontSize: 14, fontWeight: "600" },
}));
