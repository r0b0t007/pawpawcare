// Help guides (CHW-175), listed on Help & feedback and opened in GuideScreen.
// The structure lives here; every word lives in src/i18n/*.json:
//   support.guide.<id>                         title (also the Help row)
//   guides.<id>.intro / .cta                   lead paragraph, action button
//   guides.<id>.<section>.title / .body        one card per section
//   guides.<id>.<section>.step1 … step<n>      numbered steps, when `steps`
// Every statement in the copy was checked against the code it describes
// (2026-10-17); when a feature changes, update its guide in all three files.
// The numbers it quotes come from, and must follow:
//   30 days "due soon"       utils/vaccines.js
//   7 days "Coming up"       DashboardScreen (comingUp window)
//   7 days before, 09:00     backend ReminderScheduler (vaccine reminders)
//   1 hour snooze            NotificationsScreen
//   1 h / 24 h / 7 days      PetProfileScreen vet-share options + PetShareController
//   1 day to 2 weeks         PetProfileScreen care-link options + CareController
//   6-digit code             backend email verification
// `cta` opens the screen the guide is about. AddPet lives in the Pets stack
// (it hands off to PetProfile there), so it is opened on top of PetsList
// (`initial: false`) rather than alone in a tab that was never visited;
// Reminders and Invites are also registered in the Profile stack, so Back
// returns to the guide.
export const GUIDES = [
  {
    id: 'gettingStarted',
    icon: 'rocket-launch-outline',
    cta: (navigation) => navigation.navigate('Pets', { screen: 'AddPet', initial: false }),
    sections: [
      { id: 'addPet', icon: 'paw', steps: 3 },
      { id: 'records', icon: 'needle' },
      { id: 'home', icon: 'home-heart' },
      { id: 'ai', icon: 'text-box-search-outline' },
    ],
  },
  {
    id: 'reminders',
    icon: 'bell-outline',
    cta: (navigation) => navigation.navigate('Reminders'),
    sections: [
      { id: 'automatic', icon: 'bell-check-outline' },
      { id: 'custom', icon: 'bell-plus-outline' },
      { id: 'inbox', icon: 'calendar-check-outline' },
      { id: 'phone', icon: 'cellphone-cog' },
      { id: 'doses', icon: 'pill' },
    ],
  },
  {
    id: 'sharing',
    icon: 'account-group-outline',
    cta: (navigation) => navigation.navigate('Invites'),
    sections: [
      { id: 'invite', icon: 'account-multiple-plus-outline' },
      { id: 'accept', icon: 'email-check-outline' },
      { id: 'vet', icon: 'stethoscope' },
      { id: 'sitter', icon: 'clipboard-text-outline' },
      { id: 'export', icon: 'file-export-outline' },
    ],
  },
];

export const guideById = (id) => GUIDES.find((g) => g.id === id);
