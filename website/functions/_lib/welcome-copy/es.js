// Spanish (es-ES) copy of the waitlist welcome email (see ../welcome-email.js).
// en.js and fr.js have exactly the same keys. Strings may contain HTML
// entities but no tags; {url} and {email} are filled in by the template.
export default {
  lang: "es",
  subject: "Ya está en la lista. ¡Gracias!",
  preheader: "Su invitación ya está en camino. Esto es lo que llega a PawPawCare.",
  badge: "Ya está en la lista",
  title: "Gracias por unirse a PawPawCare",
  intro:
    "Estamos dando los últimos retoques a la app que reúne toda la salud de su mascota en un solo lugar, sin agobios. No tiene que hacer nada más: cuando PawPawCare esté listo para usted, recibirá su invitación aquí mismo, en este correo, para iPhone y Android.",
  whereYouAre: "Dónde está ahora",
  doneTag: "Hecho",
  steps: [
    { title: "Únase a la lista de espera", text: "Gracias por apuntarse. Ya está todo listo." },
    { title: "Reciba su invitación", text: "Llegará con el próximo grupo de la versión preliminar. No pierda de vista su bandeja de entrada." },
    { title: "Añada sus mascotas", text: "Cree un perfil para cada mascota en un par de minutos." },
  ],
  whatsComing: "Lo que llega",
  features: [
    { title: "Nunca olvide un refuerzo", text: "Recordatorios antes de cada vencimiento de vacunas y medicamentos, para que no se le escape nada." },
    { title: "Todas sus mascotas, en un solo lugar", text: "Visitas al veterinario, historial y evolución del peso de todas sus mascotas, juntos y sin agobios." },
    { title: "Compartir en familia", text: "Comparta sus mascotas con su familia como copropietarios y envíe a su veterinario o cuidador un enlace de solo lectura cuando lo necesite." },
  ],
  shareTitle: "¿Conoce a alguien más con mascotas?",
  shareText: "Comparta PawPawCare con un amigo. Podrá unirse a la lista de espera en segundos y recibir también su invitación con el próximo grupo.",
  shareButton: "Invitar a un amigo",
  shareLinkLead: "O envíele el enlace:",
  // Sent by the subscriber to a friend: worded impersonally so it needs
  // neither "usted" nor "tú".
  shareMailSubject: "Una app para mascotas que me ha gustado: PawPawCare",
  shareMailBody:
    "Me acabo de apuntar a la lista de espera de PawPawCare, una app que reúne toda la salud de las mascotas en un solo lugar. Este es el enlace para apuntarse: {url}",
  signoff: "Hasta entonces, dele a algún peludo una caricia de nuestra parte.",
  team: "El equipo de PawPawCare",
  footerWhy: "Recibe este correo porque esta dirección se unió a la lista de espera en pawpawcare.app.",
  footerNotYou: "¿No ha sido usted o ha cambiado de opinión?",
  footerRemoveLink: "Pídanos que le demos de baja",
  footerRemoveTail: "y eliminaremos su dirección.",
  removeSubject: "Darme de baja de la lista de espera de PawPawCare",
  privacy: "Política de privacidad (en inglés)",
  // Plain-text version only.
  textTitle: "Ya está en la lista. ¡Gracias por unirse a PawPawCare!",
  colon: ": ",
  textDone: "(hecho)",
  textShare: "Comparta PawPawCare con un amigo. Podrá unirse a la lista de espera en segundos:",
  textNotYou: "¿No ha sido usted o ha cambiado de opinión? Escriba a {email} y eliminaremos su dirección.",
};
