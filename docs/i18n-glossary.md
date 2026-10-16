# i18n glossary: French and Spanish

This is the fixed fr and es wording for terms that recur across PawPawCare. Translators, native-speaker reviewers and anyone editing a locale file should use the words in these tables. To change a term, change this file first, then change every string that uses it in the same PR.

- **Source language:** English (`en`), which is also the default and the fallback.
- **Locales:** `fr` (France) and `es` (Spain, **es-ES**).
- **Owner decisions (2026-10-15):** formal address everywhere, and Spanish follows es-ES (see [Conventions](#conventions)).
- **How the terms were picked:** for each term we grepped the current files and kept the wording that already dominates, unless it was medically wrong, informal, or Latin-American Spanish. This keeps churn low. When the files use two wordings, the table names the winner, and the "Variants to replace" column lists the losing wordings with their keys or files. The [full list of fixes](#variants-to-replace-by-file) is at the end, grouped by file.
- **Files covered:**
  - `frontend/src/i18n/{en,fr,es}.json`: app UI, i18next `{{placeholders}}`.
  - `backend/lang/{fr,es}.json`: API messages, push and email text, keyed by the English string.
  - `backend/lang/{fr,es}/*.php`: `share` (vet share page), `care` (caretaker page), `export` (PDF/CSV), `weight`, `groups`, `auth`, `passwords`, `validation` and `pagination`. Laravel uses `:placeholders` and `trans_choice` pipes.

**These rules never change:**

- Never change a key, only its value.
- Never translate data the user typed: pet names, typed breeds, notes, posts, medication and vaccine names.
- Keep every placeholder exactly as it is. In the frontend that means `{{name}}`. In the backend it means `:name`, `:Name` and `:NAME`, plus the `{0} …|{1} …|[2,*] …` pipe syntax.
- Keep each plural key set as it is: `_one` and `_other`, plus `_many` for fr and es.

---

## Conventions

### Formal address
- **French:** always *vous*. Never *tu*, *ton*, *ta*, *tes* or *toi*, and never a *tu* imperative ("Ajoute" is wrong, "Ajoutez" is right). Error messages use "Impossible de … Veuillez réessayer."
- **Spanish:** always *usted*. Never *tú*, *tu*, *te* or *vosotros*, and never a *tú* imperative ("Añade" is wrong, "Añada" is right). Error messages use "No se ha podido … Inténtelo de nuevo."
- A grep on 2026-10-16 found no informal forms in any file.

### Spanish is es-ES (Spain)
- **Vocabulary:** use Spain's words. *móvil* (not *celular*), *ordenador* (not *computadora*), *pienso*, *melocotón* and *pedir cita*. Avoid colloquialisms such as *vale* and keep a neutral register.
- **Recent past:** es-ES uses the *pretérito perfecto* for recent events. Write "No se **ha** podido guardar", not "No se pudo guardar" (the "No se pudo" form is in the variants list).
- **"app":** "app" is fine in running text. "aplicación" is also correct and stays in titles ("Idioma de la aplicación") and in "tienda de aplicaciones". In French, always write *application*.

### Capitalisation
- Use sentence case in fr and es for buttons, titles, tabs, pills and section headers. Only the first word and proper nouns get a capital: "Ajouter un vaccin", "Añadir vacuna". English Title Case must never leak through.
- Months, weekdays and language names are lowercase inside a sentence (*octobre*, *lunes*, *français*). The language picker shows each language in its own name and capitalises it (Français, Español) because it is a standalone list item.
- Export cell values in `export.php` `values.*` are lowercase. The share page (`share.php`) capitalises the same words. **Same word, different case is fine.** Pet type and sex are capitalised in both files.
- Product names never change: **PawPawCare** and **PawPawCare Plus** / **Plus**.

### French typography
The current files mix two spacings:

| Location | U+00A0 (no-break space) | Ordinary space |
|---|---|---|
| `fr.json` before `:` | 30 | 19 |
| `fr.json` before `?` | 10 | 39 |
| `fr.json` before `!` | 1 | 8 |
| `fr.json` before `%` | 3 | 0 |
| `fr.json` inside `« »` | 1 | 4 |
| `backend/lang/fr.json` (all cases) | 4 | none |
| `backend/lang/fr/*.php` | none | everywhere |

`weight.php` writes U+00A0 before `%` as `"\u{00A0}"`, and uses U+202F (narrow no-break space) only as its thousands separator. No file uses U+202F before punctuation.

**Rule (consistent with the current files):** put a **U+00A0 no-break space** before `:` `;` `?` `!` and `%`, and inside `« »` (`« {{name}} »`). Do not use U+202F for punctuation. Every ordinary space in those positions is a variant to replace.

- In PHP files, write the space as `"\u{00A0}"` inside a **double-quoted** string, as `weight.php` already does. In JSON, write the literal character.
- Do not add a space before a `:placeholder` colon. In `'Pucé : :answer'`, only the space before the first colon is typography.
- Apostrophes are **straight** `'`. There are 176 straight and 5 curly in `fr.json`, and the 5 curly `’` are variants.
- Quotation marks are `« »`, never `" "`.
- Abbreviate "e.g." as **"ex."** with no colon, as in "ex. Luna" and "(ex. Promenade au parc)". The variants are "ex. :" and "p. ex.".
- Do not use the English em-dash separator in sentences. In messages, write "Impossible d'ouvrir la boutique : essayez…" and not "… — essayez…". The colon is already dominant (36 colons, 20 dashes). Keep "—" only between a title and its detail ("Jour d'adoption — 3 ans avec Rex", "PawPawCare — Dossiers de santé") and before an email signature ("— L'équipe PawPawCare").

### Spanish typography
- Use opening `¿` and `¡`, with no space before `?` `!` `:` or `;`.
- Quotation marks are `«»` with no inner spaces: `«{{name}}»`.
- Put a **U+00A0 no-break space** before `%` ("25 %", as the RAE recommends). `weightInsight.up` and `weightInsight.down` currently use an ordinary space, so they are variants.
- Abbreviate "e.g." as **"p. ej."** with no comma after it. "p. ej.," is a variant.
- As in French, a colon replaces the English " — " separator in messages ("Error al subir: no se ha perdido nada"). Colons already dominate (31 colons, 19 dashes).

### Gender agreement
- **The pet:** French agrees with *animal*, which is masculine ("retrouvé", "Disparu", "est prêt"). Spanish agrees with *mascota*, which is feminine ("encontrada", "Desaparecida", "ya está lista", "¡Bienvenida a casa!"). One Spanish string breaks this pattern and is listed as a variant.
- **The user** (gender unknown): use the generic masculine in UI text (fr "connecté", "abonné", "Vous seul" / es "Bienvenido", "Sea el primero"). Where you can, rephrase so no agreement is needed. Column headers in exports may keep "Né(e)", "Nacido/a", "Veterinario/a" and "Propietario/a". Do not add "·e" or "/a" to UI sentences.
- **Medical nouns:** agreement follows the noun. French *vaccin* is masculine ("Administré le") and *vaccination* is feminine ("Administrée le", "effectuée"). Spanish *vacuna* is feminine ("administrada", "atrasada", "próxima").

### Numbers, dates and times
See [Dates and units](#dates-and-units). In short: use a decimal comma, 24-hour time, and day-month-year order.

---

## Pet and medical

| English | French | Spanish (es-ES) | Variants to replace | Notes |
|---|---|---|---|---|
| pet | animal (pl. animaux) | mascota | none | "Your pets" is "Vos animaux" / "Sus mascotas". |
| owner | propriétaire | propietario | es: *dueño* (`lostPets.intro`, `lostPets.contactOwner`) | |
| vaccine (the item, a row, a document category) | vaccin | vacuna | fr `share.php` categories.vaccination *Vaccination*. es `share.php` categories.vaccination *Vacunación*. | Category chip: fr "Vaccin" / es "Vacuna" (export: "vaccin" / "vacuna"). |
| vaccination (the act, and section headers) | vaccination (headers: "Vaccinations") | vacunación (headers: "Vacunas") | none | es section headers stay "Vacunas" (share, export, extract). Use "vacunación" for the act: "Vacunación programada", "certificado de vacunación". |
| booster | rappel ("rappel antirabique") | refuerzo ("refuerzo de la rabia") | none | In fr, *rappel* also means "reminder". Where the two could be confused, write "rappel de vaccin". |
| next due (booster date) | prochain rappel | próximo vencimiento | none | |
| deworming | vermifugation (treatment: vermifuge) | desparasitación interna | none (not yet in the files) | Proposed wording for future strings. |
| flea & tick | puces et tiques (treatment: antiparasitaire externe) | pulgas y garrapatas (treatment: desparasitación externa / antiparasitario) | none (not yet in the files) | Proposed wording. |
| heartworm | dirofilariose | gusano del corazón (medical: dirofilariosis) | fr: *ver du cœur* (`reminders.form.placeholder`) | *ver du cœur* is Canadian French. In France, write "comprimé contre la dirofilariose". In Spain, "gusano del corazón" is the usual word for owners. |
| microchip (noun) | puce électronique | microchip | none | |
| microchipped (adjective) | pucé | con microchip | none | As a column or row label: fr "Pucé", es "Microchip" (followed by "sí"/"no"). |
| spay / neuter | stérilisation, stérilisé(e) (male only: castré) | esterilización, esterilizado/a (male only: castrado) | none (not yet in the files) | Proposed wording. Use "stérilisé(e)" / "esterilizado/a" for both sexes unless the UI asks about males specifically. |
| weight | poids | peso | none | |
| weight entry (one weigh-in) | pesée | registro de peso | fr: *Mesure de poids* (`backend/lang/fr.json` "Weight entry not found") | |
| medication | médicament(s) | medicamento(s) | fr: *Traitement(s)* (`share.php` medications/no_medications, `care.php` medications/no_medications). es: *Medicación* (`share.php` medications/no_medications, `care.php` medications/no_medications, `backend/lang/es.json` "Medication: :medication") | "Active medications": fr "Médicaments en cours" / es "Medicamentos activos". |
| meds (short) | médicaments | medicamentos | none | |
| dose (one administration) | dose (time of day: prise) | dosis (time of day: toma) | none | Matching labels: "Heures de prise" / "Horas de las tomas" and "Dernière prise" / "Última toma". |
| dosage (amount and regimen) | posologie | dosis | fr: *Dosage* (`export.php` pdf.col.dosage and csv.col.dosage, `petProfile.medication.dosagePlaceholder`) | French *dosage* means a lab assay, so it is wrong here. Spanish *posología* would also be correct, but *dosis* is already used everywhere, so keep it. |
| frequency | fréquence | frecuencia | none | |
| daily | quotidien | diaria | fr: *quotidienne* (`export.php` values.frequency.daily). es: *diario* (`records.extract.frequency.daily`) | French uses the masculine adjective throughout (it matches `share.php` and the app). Spanish uses the feminine, agreeing with *frecuencia*. |
| weekly | hebdomadaire | semanal | none | |
| monthly | mensuel | mensual | fr: *mensuelle* (`export.php` values.frequency.monthly) | |
| as needed | au besoin | según necesidad | es: *según sea necesario* (`share.php` frequencies.as_needed) | |
| vet (person) | vétérinaire | veterinario | none | Export headers may use "Veterinario/a". |
| vet clinic / clinic | clinique vétérinaire / clinique | clínica veterinaria / clínica | none | |
| vet visit | visite vétérinaire | visita al veterinario | none | |
| appointment | rendez-vous | cita | none | "needs booking": fr "rendez-vous à prendre" / es "pedir cita". |
| lab results (category: lab) | résultats d'analyse; category "Analyse" | resultados de análisis; category "Análisis" | fr: *Analyses* (`share.php` categories.lab) | |
| prescription (category; en UI says "Rx") | ordonnance | receta | none | |
| imaging (category) | imagerie | imagen | es: *Diagnóstico por imagen* (`share.php` categories.imaging) | Keep es "Imagen" because it fits a short chip. Running prose may say "pruebas de imagen". |
| invoice (category) | facture | factura | none | |
| insurance (category) | assurance | seguro | none | |
| health records (the whole history) | dossiers de santé (one pet: dossier médical) | historial de salud (several pets: historiales) | es: *registros de salud* when it means the whole set (`records.export.dialogTitle`) | |
| record (one entry: a vaccine row, a document) | entrée, or the specific noun (vaccin, document) | registro | fr: *dossier* when it means one entry (`health.addRecord`, `health.sheet.title`, `health.toast.saved`/`saveFailed`, `vaccines.toast.deleted`/`deleteFailed`, `vaccines.confirmDelete.*`, `records.extract.added_*`; use "document" in `records.upload`, `records.uploadPhoto`, `records.doc.choose`, `records.toast.stillReading`) | French *dossier* is a whole file. "Nouveau dossier" for a single vaccine reads wrong. The reviewer phrases `gamification.milestones.*Record*`. |
| gotcha day | jour d'adoption | día de adopción | fr: *Anniversaire d'adoption* (`backend/lang/fr.json` "Gotcha day!"). es: *aniversario(s) de adopción* (`profile.notifications.celebrationsSubtitle`, `backend/lang/es.json` "Gotcha day!") | |
| birthday | anniversaire | cumpleaños | none | |
| breed / species / sex | race / espèce / sexe | raza / especie / sexo | none | "Type" in the edit form: fr "Espèce", es "Especie". |
| male / female | Mâle / Femelle | Macho / Hembra | none | Already consistent between `share.php` and `export.php`. |
| dog / cat / bird / rabbit / other | Chien / Chat / Oiseau / Lapin / Autre | Perro / Gato / Pájaro / Conejo / Otro | none | Already consistent between `share.php` and `export.php`. |

## Product words

| English | French | Spanish (es-ES) | Variants to replace | Notes |
|---|---|---|---|---|
| PawPawCare Plus / Plus (paid plan) | PawPawCare Plus / Plus | PawPawCare Plus / Plus | none | **Never translate.** Write fr "abonné à Plus", es "funciones Plus". |
| free plan | offre gratuite | plan gratuito | none | A plan in general: fr *offre*, es *plan*. |
| subscription | abonnement | suscripción | none | |
| subscribe / cancel a subscription | s'abonner / résilier | suscribirse / cancelar | none | |
| free trial | essai gratuit | prueba gratuita | none | |
| restore purchases | restaurer les achats | restaurar compras | none | |
| early member | membre de la première heure | miembro pionero | none | |
| Medical vault | Coffre médical (short: coffre) | Archivo médico (short: archivo) | es: *caja fuerte* (`export.php` pdf.no_documents, csv.documents) | |
| Care team | Équipe de soins | Equipo de cuidados | es: *Equipo de cuidado* (`petProfile.overview.careTeam`, `petProfile.menu.careTeam`, `petProfile.careTeam.title`, `petProfile.careTeam.removeA11y`, `records.hero.private`) | The es noun "care" is plural *cuidados* in every compound. See "streak" below. |
| care (noun, in compounds) | soins | cuidados | es: singular *cuidado* (`gamification.careStreaks.title`, `gamification.careStreaks.weeks_*`, `backend/lang/es.json` ":count care action") | Examples: "Rappels de soins" / "Recordatorios de cuidados", "Votre semaine de soins" / "Su semana de cuidados". |
| Caretaker (sitter) | gardien | cuidador | none | |
| caretaker link / handoff | lien de garde / passation au gardien | enlace para cuidadores / traspaso al cuidador | fr: *liens pour les gardiens* (`paywall.reason.care_links`, `paywall.benefits.linksTitle`). es: *enlace de cuidador* (`backend/lang/es.json` "This caretaker link has been revoked.") | The caretaker page eyebrow is fr "Consignes de garde" / es "Instrucciones para el cuidador". |
| co-owner | copropriétaire | copropietario | none | "co-own" is fr "devenir copropriétaire" / es "ser copropietario". |
| share link (vet share) | lien de partage | enlace compartido | es: *enlace para compartir* (`backend/lang/es.json` "This share link has been revoked.") | "Share with vet" is fr "Partager avec le vétérinaire" / es "Compartir con el veterinario". |
| read-only | lecture seule | solo lectura | none | |
| records export / export (noun) | export (des dossiers de santé) | exportación (del historial de salud) | none | The verb is fr *exporter* / es *exportar*. |
| reminder | rappel | recordatorio | none | |
| notification | notification | notificación | none | |
| community | communauté | comunidad | none | |
| group | groupe | grupo | none | |
| post (noun / verb) | publication / publier | publicación / publicar | none | |
| feed | fil | muro | none | |
| comment | commentaire | comentario | none | |
| paw (like) | patte | patita | none | |
| report (moderation) | signalement / signaler | denuncia / denunciar | none | "Report already resolved" / "Report not found" in `backend/lang/es.json` come from the lost-pet board, so they keep *aviso*. |
| lost pet / found pet | animal perdu / retrouvé | mascota perdida / encontrada | es: *¡Bienvenido a casa!* (`petProfile.toast.welcomeHome`), which should be *¡Bienvenida a casa!* | The English "Missing" status (card) stays fr *Disparu* / es *Desaparecida*, as in the English source. The board is fr "tableau" (Animaux perdus) / es "tablón" (Mascotas perdidas). A lost-pet report is fr *signalement* / es *aviso*. |
| streak | série | racha | none | "Care streaks" is fr "Séries de soins" / es "Rachas de cuidados". |
| milestone | étape | logro | none | |
| weekly recap | bilan hebdomadaire / votre semaine de soins | resumen semanal / su semana de cuidados | none | |
| account | compte | cuenta | none | |
| email | e-mail (formal: adresse e-mail) | correo electrónico (short: correo) | none | |
| password | mot de passe | contraseña | none | |
| app store | boutique d'applications | tienda de aplicaciones | none | |

## UI actions

| English | French | Spanish (es-ES) | Variants to replace | Notes |
|---|---|---|---|---|
| Save | Enregistrer | Guardar | none | |
| Cancel | Annuler | Cancelar | none | |
| Delete (destroys data) | Supprimer | Eliminar | none | Deletes only happen behind ConfirmDialog. Confirm-dialog titles end with "?": fr "Supprimer … ?" (no-break space before ?), es "¿Eliminar …?". |
| Remove (detaches something; no data lost) | Retirer | Quitar | none | When removing destroys data (a pet), use fr "Supprimer" / es "Eliminar". Keep es "Eliminar" where it is already used for list removals; do not churn it. |
| Edit | Modifier | Editar | none | |
| Add | Ajouter | Añadir | none | |
| Done (button) | Terminé | Hecho | es: *Listo* (`paywall.done`, `vaccines.picker.done`) | *Listo* is the Latin-American usage. The fr date picker may keep "OK". |
| Done (state of a task) / Mark done | Fait / Marquer comme fait | Hecho / Marcar como hecho | none | |
| Mark as administered (vaccine) | Marquer comme administré | Marcar como administrada | none | |
| Try again / Retry (button) | Réessayer | Reintentar | es: *Intentar de nuevo* (`auth.reconnect.retry`, `paywall.retry`, `errors.crash.retry`) | Inside a sentence: fr "Veuillez réessayer." / es "Inténtelo de nuevo." |
| Couldn't … (error) | Impossible de … | No se ha podido … | es: *No se pudo / No se pudieron* (22 keys: `home.vaccinesFailed*`, `home.toast.*Failed`, `health.toast.*Failed`, `vaccines.toast.*Failed`, `reminders.toast.*Failed`, `records.openFailed`, `records.toast.*`, `records.delete.*.failed`, `records.doc.pickFailed`, `records.clinic.saveFailed`, `records.visit.saveFailed`, `records.extract.applyFailed`) | |
| Log (a dose, weight or visit) | Noter (button); enregistré(e) (done) | Registrar | none | fr keeps *Noter* for the action: *Enregistrer* is already Save, and a Log tap records at once with no confirm step. |
| Upload | Importer / import | Subir / subida | fr: *envoyer / envoi* when it means upload (`addPet.uploadFailed`, `editPet.uploadFailed`, `editPet.uploadingA11y`, `community.attachFailed`, `common.errors.imageUploadFailed`, `common.errors.documentUploadFailed`) | |
| Share | Partager | Compartir | none | |
| Schedule / Reschedule | Programmer / Reprogrammer | Programar / Reprogramar | none | |
| Snooze | Reporter | Posponer | none | |
| Dismiss (notification or banner) | Ignorer (banner: Fermer) | Descartar | none | Dismissing moderation reports is fr "Rejeter" / es "Descartar". |
| Invite / Accept / Decline | Inviter / Accepter / Refuser | Invitar / Aceptar / Rechazar | none | |
| Withdraw (invite) / Revoke (links) | Retirer / Révoquer | Retirar / Revocar | none | |
| Leave (a pet or group) / Join | Quitter / Rejoindre | Dejar (pet), Salir (group) / Unirse | none | |
| Log in / Log out / Sign up | Se connecter / Se déconnecter / Créer un compte | Iniciar sesión / Cerrar sesión / Crear cuenta | none | |
| Tap (in hints) | Touchez | Toque | none | |
| See all / Show more / Show less | Tout voir / Afficher {{count}} de plus / Afficher moins | Ver todo / Mostrar {{count}} más / Mostrar menos | none | |
| Report (a post) | Signaler | Denunciar | none | |
| Report lost / Mark as found | Signaler la perte / Marquer comme retrouvé | Avisar de la pérdida / Marcar como encontrada | none | |

## Status words

| English | French | Spanish (es-ES) | Variants to replace | Notes |
|---|---|---|---|---|
| Due (with a date) | Prévu le {{date}} (noun: échéance; field: Date d'échéance) | Vence el {{date}} (noun: vencimiento; field: Fecha de vencimiento) | fr: *à faire (le)* (`backend/lang/fr.json` ":pet — :vaccine is due :date", "Vaccination due: :vaccine"). es: *Prevista el* (`share.php` due), *fecha prevista* / *Vacuna pendiente* (`backend/lang/es.json`, the same two keys) | "Was due" is fr "Était prévu le" / es "Vencía el". |
| Due soon (pill) | Échéance proche (count: {{count}} échéance(s) proche(s)) | Vence pronto | fr: *Bientôt* (`status.dueSoon`, `home.more.dueSoon_*`), *Bientôt dû* (`petProfile.vaxStatus.dueSoon`) | French *dû* is a financial word, and "Bientôt" alone is ambiguous on a pill. "échéance" is already used in `home.status.dueSoon_*` and `home.more.moreDueSoon_*`. |
| Overdue | En retard | Atrasada (agrees with vacuna); generic: Atrasado | es: *Vencida* (`petProfile.vaxStatus.overdue`, `export.php` values.vaccination_status.overdue) | "Overdue · 3 days" is fr "En retard · 3 jours" / es "Atrasado · 3 días". |
| Upcoming | À venir | Próxima(s) | none | The export cell is lowercase: "à venir" / "próxima". |
| Completed (vaccine status) | effectué (agrees with vaccin, as on the app, the share page and the export) | administrada | es: *Completada* (`share.php` completed) | The given date is fr "Administré(e) le :date" / es "Administrada el :date". |
| Scheduled (appointment or vaccine status) | Prévu(e) | Programada | fr: *Planifié* (`petProfile.vaxStatus.scheduled`) | A reminder or notification scheduled on the device stays fr "Programmé(e)" / es "Programada". |
| Completed / Cancelled (appointment) | Effectué / Annulé | Realizada / Cancelada | none | Export cells are lowercase. |
| All good / Up to date | Tout va bien / Tout est à jour | Todo bien / Todo al día | none | |
| Needs attention | À traiter | Requiere atención | none | |
| Pending (invite or purchase) | en attente | pendiente | none | |
| Active | Actif | Activo | none | |
| Expires {{date}} (links) | Expire le {{date}} | Caduca el {{date}} | none | Keep es *caduca* for links and *vence* for due dates. Do not swap them. |
| Lost / Missing / Found | Perdu / Disparu / Retrouvé | Perdida / Desaparecida / Encontrada | none | Agreement rules are in [Conventions](#gender-agreement). |
| Unread / New | non lu(e) / Nouveau | sin leer / Nueva | none | |
| Synced | Synchronisé | Sincronizado | none | |

## Dates and units

| English | French | Spanish (es-ES) | Variants to replace | Notes |
|---|---|---|---|---|
| short date | `D MMM YYYY`: 14 oct. 2026 | `D MMM YYYY`: 14 oct 2026 | none | Backend formats are in `share.php`/`export.php` `formats`/`date_format`. The app uses Intl with fr-FR / es-ES (`frontend/src/utils/dates.js`). |
| long date | `D MMMM YYYY`: 14 octobre 2026 (first of the month: 1er octobre) | `D [de] MMMM [de] YYYY`: 14 de octubre de 2026 | none | `backend/lang/fr.json` uses `Do MMMM YYYY` to get "1er". |
| day + month in a sentence | le {{day}} {{month}} | el {{day}} de {{month}} | none | Months and weekdays are lowercase. |
| time | 24 h, `HH:mm`: 09:05; in prose "8 h", "18 h 30" | 24 h, `H:mm`: 9:05; in prose "a las 9:00" | es: `HH:mm` (`export.php` formats.datetime) | Never write AM/PM in fr or es. |
| date + time | `D MMM YYYY [à] HH:mm` | `D MMM YYYY, H:mm` | none | |
| relative | il y a 3 min / 3 h / 3 j; dans 3 jours | hace 3 min / 3 h / 3 d; dentro de 3 días | none | |
| decimals | comma: 1,5 / 22,5 kg | comma: 1,5 / 22,5 kg | See the warning below | |
| thousands | U+202F narrow no-break space: 1 250 | period, from 5 digits up: 12.500 (no separator for 4 digits: 1250) | none | Set in `weight.php`. |
| percent | 25 % (U+00A0) | 25 % (U+00A0) | es: ordinary space (`petProfile.weightInsight.up`, `petProfile.weightInsight.down`) | |
| age | 1 an, 1,5 an, 2 ans (singular below 2) | 1 año, 1,5 años, 2 años | none | fr is handled by `share.php` `age_value` (`[*,1.9] … an|[2,*] … ans`). |
| weight units | kg, lb | kg, lb | none | |
| file sizes | o, Ko, Mo | B, KB, MB | none | |
| "e.g." in placeholders | ex. | p. ej. | fr: *ex. :* (`health.sheet.namePlaceholder`, `vaccines.sheet.namePlaceholder`, `reminders.form.placeholder`, `records.doc.titlePlaceholder`, `records.clinic.namePlaceholder`, `records.visit.reasonPlaceholder`), *p. ex.* (`lostPets.lastSeenPlaceholder`). es: *p. ej.,* (`auth.signup.namePlaceholder` and the same six placeholder keys) | |

> **Decimal comma: code caveat.** Weights and amounts are formatted in code with `toFixed()`, which prints a dot, and typed input is parsed with `parseFloat()`, which turns "22,5" into 22 (`PetProfileScreen.js`, `DataContext.js`). Until the code accepts and prints commas, **leave the numeric examples in placeholders as they are** ("ex. 22.5", "p. ej. 45.00"). Report the comma problem as a code bug, not as a translation fix. In prose and on backend pages (`weight.php`), use the comma.

---

## share.php vs export.php: one wording per value

The vet share page (`share.php`) and the PDF/CSV export (`export.php` `values.*`) display the same stored ids. The app's own chips (`records.categories.*`, `petProfile.frequency.*`, `records.extract.frequency.*`) show them too. The resolved wording is below. Export cells are lowercase and the share page is capitalised, which is fine.

| id | fr (share / export) | es (share / export) | Change |
|---|---|---|---|
| frequency `daily` | Quotidien / quotidien | Diaria / diaria | fr `export.php`: *quotidienne* becomes *quotidien*. es `records.extract.frequency.daily`: *diario* becomes *diaria*. |
| frequency `weekly` | Hebdomadaire / hebdomadaire | Semanal / semanal | none |
| frequency `monthly` | Mensuel / mensuel | Mensual / mensual | fr `export.php`: *mensuelle* becomes *mensuel*. |
| frequency `as_needed` | Au besoin / au besoin | Según necesidad / según necesidad | es `share.php`: *según sea necesario* becomes *según necesidad*. |
| category `lab` | Analyse / analyse | Análisis / análisis | fr `share.php`: *Analyses* becomes *Analyse*. |
| category `vaccination` | Vaccin / vaccin | Vacuna / vacuna | fr `share.php`: *Vaccination* becomes *Vaccin*. es `share.php`: *Vacunación* becomes *Vacuna*. |
| category `prescription` | Ordonnance / ordonnance | Receta / receta | none |
| category `invoice` | Facture / facture | Factura / factura | none |
| category `imaging` | Imagerie / imagerie | Imagen / imagen | es `share.php`: *Diagnóstico por imagen* becomes *Imagen*. |
| category `insurance` | Assurance / assurance | Seguro / seguro | none |
| category `other` | Autre / autre | Otro / otro | none |
| vaccination status `completed` | Effectué / effectué | Administrada / administrada | es `share.php`: *Completada* becomes *Administrada*. |
| vaccination status `overdue` | — / en retard | — / atrasada | es `export.php`: *vencida* becomes *atrasada*. |
| vaccination status `upcoming` | — / à venir | — / próxima | none |
| pet type, sex | identical | identical | none |
| medications heading | Médicaments en cours | Medicamentos activos | fr `share.php`/`care.php`: *Traitements (en cours)* becomes *Médicaments (en cours)*. es `share.php`/`care.php`: *Medicación (activa)* becomes *Medicamentos (activos)*. |
| dosage column | Posologie | Dosis | fr `export.php` pdf.col.dosage and csv.col.dosage: *Dosage* becomes *Posologie*. |
| due (with a date) | Prévu le :date | Vence el :date | es `share.php` due: *Prevista el :date* becomes *Vence el :date*. |

---

## Variants to replace, by file

Fix these in one PR per language, after native review. Change values only. Some tests pin exact strings (see the [review checklist](i18n-review-checklist.md#5-reporting-and-applying-fixes)).

**`frontend/src/i18n/fr.json`**
- Due soon. `status.dueSoon`, `home.more.dueSoon_*` *Bientôt* and `petProfile.vaxStatus.dueSoon` *Bientôt dû* become **Échéance proche** (with the plural agreement the count needs).
- Scheduled. `petProfile.vaxStatus.scheduled` *Planifié* becomes **Prévu**.
- Heartworm. `reminders.form.placeholder` *ver du cœur* becomes **dirofilariose**.
- Dosage. `petProfile.medication.dosagePlaceholder` *Dosage* becomes **Posologie**.
- Caretaker links. `paywall.reason.care_links` and `paywall.benefits.linksTitle` *liens pour les gardiens* become **liens de garde**.
- Log. `home.today.log`, `petProfile.medication.log`, `records.logVisit` and `gamification.streak.loggedYesterday` *Noter / notée* become **Enregistrer / enregistrée**.
- Upload. `addPet.uploadFailed`, `editPet.uploadFailed`, `editPet.uploadingA11y`, `community.attachFailed`, `common.errors.imageUploadFailed` and `common.errors.documentUploadFailed` *envoyer / envoi* become **importer / import**.
- Single record. *dossier* used for one entry becomes **entrée** or **document**: `health.addRecord`, `health.sheet.title`, `health.toast.saved`, `health.toast.saveFailed`, `vaccines.toast.deleted`, `vaccines.toast.deleteFailed`, `vaccines.confirmDelete.title`, `vaccines.confirmDelete.message`, `records.extract.added_*`, `records.upload`, `records.uploadPhoto`, `records.doc.choose`, `records.toast.stillReading`. The reviewer phrases `gamification.milestones.firstRecord` and `records10` / `records25` / `records100`.
- Apostrophes. Curly *’* becomes **'** in `notifications.actions.snoozeHour`, `notifications.snoozeA11y`, `records.toast.stillReading`, `records.empty.body` and `gamification.recap.vaccinesNeedLook`.
- Examples. *ex. :* and *p. ex.* become **ex.** (keys listed in the Dates and units table).
- Spacing. Every ordinary space before `: ; ? ! %` or inside `« »` becomes **U+00A0**. That is about 19 colons, 39 question marks, 8 exclamation marks and 4 guillemet pairs.
- Separators. The mid-sentence " — " becomes **" : "** (U+00A0 before the colon) in messages and toasts (about 20 strings).

**`frontend/src/i18n/es.json`**
- Overdue. `petProfile.vaxStatus.overdue` *Vencida* becomes **Atrasada**.
- Errors. *No se pudo / No se pudieron* becomes **No se ha podido / No se han podido** (22 keys, listed in the UI actions table).
- Retry. `auth.reconnect.retry`, `paywall.retry` and `errors.crash.retry` *Intentar de nuevo* become **Reintentar**.
- Done. `paywall.done` and `vaccines.picker.done` *Listo* become **Hecho**.
- Care. *cuidado* becomes **cuidados** in `petProfile.overview.careTeam`, `petProfile.menu.careTeam`, `petProfile.careTeam.title`, `petProfile.careTeam.removeA11y`, `records.hero.private`, `gamification.careStreaks.title` and `gamification.careStreaks.weeks_*`.
- Gotcha day. `profile.notifications.celebrationsSubtitle` *aniversarios de adopción* becomes **días de adopción**.
- Health records. `records.export.dialogTitle` *registros de salud* becomes **historial de salud**.
- Daily. `records.extract.frequency.daily` *diario* becomes **diaria**.
- Welcome home. `petProfile.toast.welcomeHome` *¡Bienvenido a casa!* becomes **¡Bienvenida a casa!**
- Owner. `lostPets.intro` and `lostPets.contactOwner` *dueño(s)* become **propietario(s)**.
- Percent. `petProfile.weightInsight.up` and `petProfile.weightInsight.down`: the ordinary space before `%` becomes **U+00A0**.
- Examples. *p. ej.,* becomes **p. ej.** in 7 placeholders.
- Separators. The mid-sentence " — " becomes **": "** in messages and toasts (about 19 strings).

**`backend/lang/fr.json`**
- "Gotcha day!" *Anniversaire d'adoption !* becomes **Jour d'adoption !**
- "Vaccination due: :vaccine" *à faire* becomes **Vaccin prévu : :vaccine**. ":pet — :vaccine is due :date" becomes **:pet — :vaccine, échéance le :date**: the vaccine name is user-typed, so nothing may agree with its gender.
- "Weight entry not found" *Mesure de poids* becomes **Pesée**.

**`backend/lang/es.json`**
- "Gotcha day!" *¡Aniversario de adopción!* becomes **¡Día de adopción!**
- ":count care action|…" *acción de cuidado* becomes **acción de cuidados**, or rephrase.
- "Medication: :medication" *Medicación* becomes **Medicamento**.
- "This caretaker link has been revoked." *enlace de cuidador* becomes **enlace para cuidadores**.
- "This share link has been revoked." *enlace para compartir* becomes **enlace compartido**.
- ":pet — :vaccine is due :date": *fecha prevista* becomes **:vaccine vence el :date**, the app-wide due-date verb. "Vaccination due: :vaccine" stays **Vacuna pendiente: :vaccine**: the bare noun *Vencimiento de vacuna* reads as "vaccine expiry". Native reviewer: confirm *vence (el)* for due dates app-wide (about 20 strings), or pick one replacement for all of them.

**`backend/lang/fr/*.php`**
- `share.php`: categories.lab *Analyses* becomes **Analyse**, categories.vaccination *Vaccination* becomes **Vaccin**, and medications/no_medications *Traitement(s)* become **Médicament(s)**.
- `care.php`: medications/no_medications *Traitement(s)* become **Médicament(s)**.
- `export.php`: values.frequency daily/monthly *quotidienne / mensuelle* become **quotidien / mensuel**, and pdf.col.dosage and csv.col.dosage *Dosage* become **Posologie**.
- Spacing: an ordinary space before a punctuation `:` (not a `:placeholder` colon) becomes **"\u{00A0}"** in a double-quoted string. Today this affects `export.php` `pdf.microchipped` ('Pucé : :answer') and `csv.pet` ('=== ANIMAL : :name ==='). `validation.php` has 11 more cases ("suivantes : :values", "de type : :values"). It is the project's own AI-drafted file, not a laravel-lang copy, so fix those as well.

**`backend/lang/es/*.php`**
- `share.php`: frequencies.as_needed becomes **según necesidad**, categories.vaccination becomes **Vacuna**, categories.imaging becomes **Imagen**, completed becomes **Administrada**, due becomes **Vence el :date**, and medications/no_medications become **Medicamentos activos / No hay medicamentos activos.**
- `care.php`: medications/no_medications become **Medicamentos / No hay medicamentos activos.**
- `export.php`: values.vaccination_status.overdue becomes **atrasada**, pdf.no_documents and csv.documents *caja fuerte* become **archivo**, and formats.datetime `HH:mm` becomes **`H:mm`**.

**Already consistent:** pet types, sexes, appointment statuses, invoice, insurance, prescription, reminder, notification, community, group, post, streak, milestone, co-owner, subscription, Plus. Also every fr/es `trans_choice` and plural key set.
