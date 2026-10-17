// Help guides (CHW-175), listed on Help & feedback and opened in GuideScreen.
// The structure lives here; every word lives in src/i18n/*.json:
//   support.guide.<id>                         title (also the Help row)
//   guides.<id>.intro / .cta                   lead paragraph, action button
//   guides.<id>.<section>.title / .body        one card per section
//   guides.<id>.<section>.step1 … step<n>      numbered steps, when `steps`
// Every statement in the copy was checked against the code it describes
// (2026-10-17); when a feature changes, update its guide in all three files.
// `cta` opens the screen the guide is about, using the same cross-tab
// navigate() calls as the rest of the app.
export const GUIDES = [
  {
    id: 'gettingStarted',
    icon: 'rocket-launch-outline',
    cta: (navigation) => navigation.navigate('Pets', { screen: 'AddPet' }),
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
    cta: (navigation) => navigation.navigate('Health', { screen: 'Reminders' }),
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
