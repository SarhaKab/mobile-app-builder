import Ionicons from "@react-native-vector-icons/ionicons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { signedVideoUrl } from "@/src/home";
import { useI18n } from "@/src/i18n";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Lecteur d'une vidéo du stockage privé KFIT. Sans fichier, il l'indique clairement. */
export function VideoPlayer({ path, loop = false }: { path: string | null | undefined; loop?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(null); setFailed(false);
    if (path) signedVideoUrl(path).then(setUrl).catch(() => setFailed(true));
  }, [path]);

  const player = useVideoPlayer(url, (p) => { p.loop = loop; p.muted = loop; });
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => { if (status === "error") setFailed(true); });
    return () => sub.remove();
  }, [player]);

  if (!path || failed) {
    return (
      <View style={s.box} testID="video-unavailable">
        <Ionicons name="videocam-off-outline" size={32} color={colors.muted} />
        <Text style={s.text}>{t(failed ? "videoError" : "videoUnavailable")}</Text>
      </View>
    );
  }
  if (!url) return <View style={s.box}><ActivityIndicator color={colors.brandPrimary} /></View>;
  return (
    <View style={s.frame} testID="video-player">
      <VideoView player={player} style={s.video} nativeControls contentFit="contain" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  box: { aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.md },
  text: { color: c.muted, fontSize: 13, textAlign: "center" },
  frame: { aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceSecondary },
  video: { width: "100%", height: "100%" },
}));
