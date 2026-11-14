import Ionicons from "@react-native-vector-icons/ionicons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Cue, loadMedia } from "@/src/home";
import { useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

/**
 * Lecteur d'une vidéo du stockage privé KFIT.
 * Si une version commentée existe dans la langue de l'utilisateur, elle est lue avec sa voix off
 * et ses sous-titres synchronisés (activés par défaut, désactivables). Sinon, la démonstration muette tourne en boucle.
 */
export function VideoPlayer({ path, title }: { path: string | null | undefined; title?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const [media, setMedia] = useState<{ url: string; cues: Cue[] | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [subtitles, setSubtitles] = useState(true);

  useEffect(() => {
    let live = true;
    setMedia(null); setFailed(false);
    if (path) loadMedia(path, lang).then((m) => live && setMedia(m)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [path, lang]);

  const narrated = !!media?.cues;
  const player = useVideoPlayer(media?.url ?? null, (p) => { p.timeUpdateEventInterval = 0.25; });
  useEffect(() => { player.loop = !narrated; player.muted = !narrated; }, [player, narrated, media]);
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => { if (status === "error") setFailed(true); });
    return () => sub.remove();
  }, [player]);
  const time = useEvent(player, "timeUpdate")?.currentTime ?? 0;
  const cue = media?.cues?.find((c) => time >= c.start && time <= c.end + 0.3);

  if (!path || failed) {
    return (
      <View style={s.box} testID="video-unavailable">
        <Ionicons name="videocam-off-outline" size={32} color={colors.muted} />
        <Text style={s.text}>{t(failed ? "videoError" : "videoUnavailable")}</Text>
      </View>
    );
  }
  if (!media) return <View style={s.box}><ActivityIndicator color={colors.brandPrimary} /></View>;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={s.frame} testID="video-player" accessible accessibilityLabel={[t(narrated ? "videoNarrated" : "videoSilent"), title].filter(Boolean).join(" — ")}>
        <VideoView player={player} style={s.video} nativeControls contentFit="contain" />
      </View>
      {narrated ? (
        <>
          {subtitles && (
            <View style={s.captions} testID="video-subtitles" accessibilityLiveRegion="none">
              <Text style={s.captionText}>{cue?.text ?? t("subtitlesHint")}</Text>
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
  captions: { minHeight: 76, justifyContent: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  captionText: { color: c.onSurface, fontSize: 17, lineHeight: 24, fontWeight: "600", textAlign: "center" },
  toggle: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 6, minHeight: 44, paddingHorizontal: spacing.md },
  toggleText: { color: c.muted, fontSize: 14, fontWeight: "600" },
}));
