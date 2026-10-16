import React from 'react';
import { View, Text, Image, Share, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { resolveAsset } from '../../config';
import { dayDiff, timeAgo } from '../../utils/dates';
import { ui, type, petPair } from '../../theme';
import { Card, Button, speciesIcon } from '../../components';
import i18n, { useTranslation } from '../../i18n';

// One lost-pet report as a warm, actionable card — shared by Community (top
// of the feed + the Lost pets section) and the LostPets screen. Urgent but
// never alarm-red: the photo carries the emotion, the copy asks one question,
// and the action is one tap. No proximity or "neighbours looking" claims —
// the board has no such data, so the card never invents it.

// How long the pet has been missing: from when it was last seen (falling back
// to when it was reported), in calendar days — a report filed at 23:00 reads
// "1 day" the next morning, like every other day count in the app.
export function missingFor(lastSeenAt, reportedAt, today = new Date()) {
  const since = new Date(lastSeenAt || reportedAt || NaN);
  if (Number.isNaN(since.getTime())) return i18n.t('lostPets.card.missing');
  const days = Math.max(0, -dayDiff(since, today));
  if (days < 1) return i18n.t('lostPets.card.missingToday');
  return i18n.t('lostPets.card.missingDays', { count: days });
}

// Shares only what's already public on the board — never the contact phone.
export function shareLostPet(report) {
  const parts = [
    i18n.t('lostPets.card.haveYouSeen', { name: report.petName }),
    report.description || null,
    report.lastSeenLocation ? i18n.t('lostPets.card.shareLastSeen', { location: report.lastSeenLocation }) : null,
    i18n.t('lostPets.card.shareFooter'),
  ].filter(Boolean);
  Share.share({ message: parts.join(' ') }).catch(() => {});
}

export default function LostPetCard({
  report,
  mine,
  showReporter,
  elevated,
  onSeen, // omit to hide the primary action (e.g. no contact number)
  seenLabel,
  seenIcon = 'eye-outline',
  onFound,
  style,
}) {
  const { t } = useTranslation();
  const pair = petPair(report.petColor);
  const photo = report.photoUrl ? resolveAsset(report.photoUrl) : null;

  return (
    <Card elevated={elevated} style={[{ padding: 8 }, style]}>
      <View style={[styles.media, { backgroundColor: pair.bg }]}>
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={styles.photo}
            resizeMode="cover"
            accessibilityLabel={t('lostPets.card.photoOf', { name: report.petName })}
          />
        ) : (
          <MaterialCommunityIcons name={speciesIcon(report.petType)} size={64} color={pair.fg} />
        )}
        <View style={styles.pill}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color={ui.accent} />
          <Text style={styles.pillText}>{missingFor(report.lastSeenAt, report.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={[type.cardTitle, { color: ui.ink }]}>
          {t(mine ? 'lostPets.card.onBoard' : 'lostPets.card.haveYouSeen', { name: report.petName })}
        </Text>
        {report.description ? <Text style={styles.desc}>{report.description}</Text> : null}
        {report.lastSeenLocation ? (
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={15} color={ui.subtle} />
            <Text style={styles.metaText}>{t('lostPets.card.lastSeenNear', { location: report.lastSeenLocation })}</Text>
          </View>
        ) : null}
        {showReporter && !mine ? (
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="account-outline" size={15} color={ui.subtle} />
            <Text style={styles.metaText}>
              {t('lostPets.card.reportedBy', { name: report.reporterName || t('lostPets.card.someone'), time: timeAgo(report.createdAt) })}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {mine ? (
            <Button
              variant="soft"
              icon="home-heart"
              label={t('lostPets.card.markFound')}
              onPress={onFound}
              style={{ flex: 1.4, backgroundColor: ui.successTint }}
            />
          ) : onSeen ? (
            <Button icon={seenIcon} label={seenLabel ?? t('lostPets.card.seenThem')} onPress={onSeen} style={{ flex: 1.4 }} />
          ) : null}
          <Button
            variant="ghost"
            icon="share-variant"
            label={t('common.share')}
            onPress={() => shareLostPet(report)}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // Explicit 100% box, not absoluteFill: react-native-web leaves an
  // absoluteFill <Image> at its natural size instead of covering.
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  media: {
    height: 160,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingLeft: 9,
    paddingRight: 12,
    borderRadius: 999,
    backgroundColor: ui.glass,
  },
  pillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: ui.ink },
  body: { paddingHorizontal: 10, paddingTop: 14, paddingBottom: 10, gap: 8 },
  desc: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13.5, lineHeight: 20, color: ui.sub },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: ui.sub },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
