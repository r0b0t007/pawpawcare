import React from 'react';
import { View, Text, Image, Share, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { resolveAsset } from '../../config';
import { ui, type, petPair } from '../../theme';
import { Card, Button, speciesIcon } from '../../components';

// One lost-pet report as a warm, actionable card — shared by Community (top
// of the feed + the Lost pets section) and the LostPets screen. Urgent but
// never alarm-red: the photo carries the emotion, the copy asks one question,
// and the action is one tap. No proximity or "neighbours looking" claims —
// the board has no such data, so the card never invents it.

export function missingFor(iso) {
  if (!iso) return 'Missing';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days < 1) return 'Missing today';
  return `Missing ${days} day${days === 1 ? '' : 's'}`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Shares only what's already public on the board — never the contact phone.
export function shareLostPet(report) {
  const parts = [
    `Have you seen ${report.petName}?`,
    report.description || null,
    report.lastSeenLocation ? `Last seen near ${report.lastSeenLocation}.` : null,
    'Shared from the PawPawCare lost-pet board.',
  ].filter(Boolean);
  Share.share({ message: parts.join(' ') }).catch(() => {});
}

export default function LostPetCard({
  report,
  mine,
  showReporter,
  elevated,
  onSeen, // omit to hide the primary action (e.g. no contact number)
  seenLabel = "I've seen them",
  seenIcon = 'eye-outline',
  onFound,
  style,
}) {
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
            accessibilityLabel={`Photo of ${report.petName}`}
          />
        ) : (
          <MaterialCommunityIcons name={speciesIcon(report.petType)} size={64} color={pair.fg} />
        )}
        <View style={styles.pill}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={14} color={ui.accent} />
          <Text style={styles.pillText}>{missingFor(report.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={[type.cardTitle, { color: ui.ink }]}>
          {mine ? `${report.petName} is on the board` : `Have you seen ${report.petName}?`}
        </Text>
        {report.description ? <Text style={styles.desc}>{report.description}</Text> : null}
        {report.lastSeenLocation ? (
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={15} color={ui.subtle} />
            <Text style={styles.metaText}>Last seen near {report.lastSeenLocation}</Text>
          </View>
        ) : null}
        {showReporter && !mine ? (
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="account-outline" size={15} color={ui.subtle} />
            <Text style={styles.metaText}>
              Reported by {report.reporterName || 'someone'} · {timeAgo(report.createdAt)}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {mine ? (
            <Button
              variant="soft"
              icon="home-heart"
              label="Mark as found"
              onPress={onFound}
              style={{ flex: 1.4, backgroundColor: ui.successTint }}
            />
          ) : onSeen ? (
            <Button icon={seenIcon} label={seenLabel} onPress={onSeen} style={{ flex: 1.4 }} />
          ) : null}
          <Button
            variant="ghost"
            icon="share-variant"
            label="Share"
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
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  pillText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, color: ui.ink },
  body: { paddingHorizontal: 10, paddingTop: 14, paddingBottom: 10, gap: 8 },
  desc: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13.5, lineHeight: 20, color: ui.sub },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, color: ui.sub },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
});
