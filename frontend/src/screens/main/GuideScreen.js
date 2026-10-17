import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { ui, type, radii } from '../../theme';
import { Card, Button, ScreenHeader } from '../../components';
import { GUIDES, guideById } from './guides';

// One help guide (Help & feedback → Guides; `id` param, see guides.js): a lead
// paragraph, a card per task, then the action the guide is about and a way
// back to the message form for anything it didn't answer. Plain text in the
// app's own words (button labels quoted as they appear), so it works offline
// and in every language without screenshots to keep in sync.
export default function GuideScreen({ navigation, route }) {
  const { t } = useTranslation();
  const found = guideById(route?.params?.id);
  // A wrong id is a bug in the caller: say so in development, but still show
  // a guide rather than a blank screen.
  if (!found && __DEV__) console.warn(`GuideScreen: unknown guide id "${route?.params?.id}"`);
  const guide = found ?? GUIDES[0];
  const text = (...parts) => t(['guides', guide.id, ...parts].join('.'));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title={t(`support.guide.${guide.id}`)} onBack={() => navigation.goBack()} />

        <Text style={[type.body, styles.intro]}>{text('intro')}</Text>

        {guide.sections.map((section) => (
          <Card key={section.id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.iconBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <MaterialCommunityIcons name={section.icon} size={18} color={ui.accent} />
              </View>
              <Text style={[type.cardTitleSm, styles.cardTitle]} accessibilityRole="header">
                {text(section.id, 'title')}
              </Text>
            </View>
            <Text style={[type.body, styles.body]}>{text(section.id, 'body')}</Text>
            {section.steps ? (
              <View style={styles.steps}>
                {Array.from({ length: section.steps }, (_, i) => (
                  <View key={i} style={styles.step}>
                    {/* The list order already numbers the steps for screen
                        readers; the badge would only be an extra stop. */}
                    <View style={styles.stepBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <Text style={[type.button, styles.stepNumber]}>{i + 1}</Text>
                    </View>
                    <Text style={[type.body, styles.stepText]}>{text(section.id, `step${i + 1}`)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ))}

        <View style={styles.actions}>
          <Button label={text('cta')} onPress={() => guide.cta(navigation)} />
          {/* popTo, not navigate or goBack: goes back to the Support form if
              it's in the stack, and opens it otherwise. Since React Navigation
              7, navigate() pushes a second Support instead of going back (seen
              on the emulator: Back from the form returned to the guide). */}
          <Button variant="ghost" label={t('guides.messageUs')} onPress={() => navigation.popTo('Support')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ui.background },
  scroll: { paddingBottom: 32 }, // ScreenHeader pads the top
  intro: { color: ui.sub, marginHorizontal: 24, marginBottom: 18 },
  card: { marginHorizontal: 24, marginBottom: 14, padding: 18, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.accentTint,
  },
  cardTitle: { flex: 1, color: ui.ink },
  body: { color: ui.ink },
  steps: { gap: 10, marginTop: 2 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // min sizes, not fixed: the number scales with the system font size.
  stepBadge: {
    minWidth: 24,
    minHeight: 24,
    paddingHorizontal: 6,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.accent,
  },
  stepNumber: { color: ui.onAccent },
  stepText: { flex: 1, color: ui.ink },
  actions: { marginHorizontal: 24, marginTop: 8, gap: 10 },
});
