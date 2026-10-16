// French copy of the waitlist welcome email (see ../welcome-email.js).
// Same keys as en.js. Strings may contain HTML entities but no tags; {url}
// and {email} are filled in by the template. French typography:
// (no-break space) before : ; ? ! and inside « ». It is a real character,
// not an entity, because the mailto subject and body are URL-encoded.
export default {
  lang: "fr",
  subject: "Vous êtes sur la liste. Merci !",
  preheader: "Votre invitation est en route. Voici ce qui vous attend sur PawPawCare.",
  badge: "Vous êtes sur la liste",
  title: "Merci de rejoindre PawPawCare",
  intro:
    "Nous mettons la dernière main à l'application qui réunit toute la santé de votre animal dans un endroit serein. Vous n'avez rien d'autre à faire : dès que PawPawCare sera prêt pour vous, votre invitation arrivera ici même, dans cette boîte de réception, pour iPhone et Android.",
  whereYouAre: "Où vous en êtes",
  doneTag: "Fait",
  steps: [
    { title: "Rejoindre la liste d'attente", text: "Merci pour votre inscription. Tout est en ordre." },
    { title: "Recevoir votre invitation", text: "Elle arrivera avec le prochain groupe de l'avant-première. Surveillez votre boîte de réception." },
    { title: "Ajouter vos animaux", text: "Créez un profil pour chacun de vos animaux en quelques minutes." },
  ],
  whatsComing: "Ce qui vous attend",
  features: [
    { title: "Plus aucun rappel de vaccin oublié", text: "Un rappel à l'approche de chaque échéance de vaccin ou de médicament, pour que rien ne vous échappe." },
    { title: "Tous vos animaux, un seul endroit", text: "Visites vétérinaires, dossiers et évolution du poids de tous vos animaux, réunis dans un endroit serein." },
    { title: "Partage en famille", text: "Devenez copropriétaires de vos animaux avec votre famille, et envoyez un lien en lecture seule à votre vétérinaire ou à votre gardien quand il en a besoin." },
  ],
  shareTitle: "Vous connaissez un autre propriétaire d'animal ?",
  shareText: "Faites découvrir PawPawCare à un proche. Il peut rejoindre la liste d'attente en quelques secondes et recevoir lui aussi son invitation avec le prochain groupe.",
  shareButton: "Inviter un proche",
  shareLinkLead: "Ou envoyez-lui le lien :",
  shareMailSubject: "PawPawCare pourrait vous plaire",
  shareMailBody:
    "Je viens de m'inscrire sur la liste d'attente de PawPawCare, une application qui réunit toute la santé de votre animal dans un endroit serein. Vous pouvez vous inscrire vous aussi : {url}",
  signoff: "D'ici là, faites une caresse de notre part à votre boule de poils.",
  team: "L'équipe PawPawCare",
  footerWhy: "Vous recevez cet e-mail parce que cette adresse s'est inscrite sur la liste d'attente de pawpawcare.app.",
  footerNotYou: "Ce n'était pas vous, ou vous avez changé d'avis ?",
  footerRemoveLink: "Demandez-nous de vous retirer de la liste",
  footerRemoveTail: "et nous supprimerons votre adresse.",
  removeSubject: "Me retirer de la liste d'attente PawPawCare",
  privacy: "Politique de confidentialité (en anglais)",
  // Plain-text version only.
  textTitle: "Vous êtes sur la liste. Merci de rejoindre PawPawCare !",
  colon: " : ",
  textDone: "(fait)",
  textShare: "Faites découvrir PawPawCare à un proche. Il peut rejoindre la liste d'attente en quelques secondes :",
  textNotYou: "Ce n'était pas vous, ou vous avez changé d'avis ? Écrivez à {email} et nous supprimerons votre adresse.",
};
