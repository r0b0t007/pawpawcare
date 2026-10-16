// English copy of the waitlist welcome email (see ../welcome-email.js).
// fr.js and es.js have exactly the same keys. Strings may contain HTML
// entities but no tags; {url} and {email} are filled in by the template.
export default {
  lang: "en",
  subject: "You're on the list. Thank you!",
  preheader: "Your invite is on its way. Here's what's coming to PawPawCare.",
  badge: "You're on the list",
  title: "Thank you for joining PawPawCare",
  intro:
    "We're putting the finishing touches on the app that keeps all your pet's health in one calm place. You don't need to do anything else: when PawPawCare is ready for you, your invite lands right here in this inbox, for iPhone and Android.",
  whereYouAre: "Where you are",
  doneTag: "Done",
  steps: [
    { title: "Join the waitlist", text: "Thanks for signing up. You're all set." },
    { title: "Get your invite", text: "It arrives with the next preview batch. Keep an eye on your inbox." },
    { title: "Add your pets", text: "Set up a profile for each pet in a couple of minutes." },
  ],
  whatsComing: "What's coming",
  features: [
    { title: "Never miss a booster", text: "Due-soon reminders for vaccines and medications, so nothing slips through the cracks." },
    { title: "Every pet, one home", text: "Vet visits, records and weight trends for all your pets, together in one calm place." },
    { title: "Family sharing", text: "Co-own pets with family, and send your vet or sitter a read-only link when they need it." },
  ],
  shareTitle: "Know another pet parent?",
  shareText: "Share PawPawCare with a friend. They can join the waitlist in seconds and get their invite with the next batch, too.",
  shareButton: "Invite a friend",
  shareLinkLead: "Or send them the link:",
  shareMailSubject: "Thought you'd like PawPawCare",
  shareMailBody:
    "I just joined the waitlist for PawPawCare, an app that keeps all your pet's health in one calm place. You can join too: {url}",
  signoff: "Until then, give someone furry a scratch from us.",
  team: "The PawPawCare team",
  footerWhy: "You're receiving this because this address joined the waitlist at pawpawcare.app.",
  footerNotYou: "Not you, or changed your mind?",
  footerRemoveLink: "Ask us to remove you",
  footerRemoveTail: "and we'll delete it.",
  removeSubject: "Remove me from the PawPawCare waitlist",
  privacy: "Privacy policy",
  // Plain-text version only.
  textTitle: "You're on the list. Thank you for joining PawPawCare!",
  // Label-to-text separator in the plain-text version.
  colon: ": ",
  textDone: "(done)",
  textShare: "Share PawPawCare with a friend. They can join the waitlist in seconds:",
  textNotYou: "Not you, or changed your mind? Email {email} and we'll delete it.",
};
