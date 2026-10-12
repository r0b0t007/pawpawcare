// Reminder / notification type → icon, shared by Reminders and Notifications
// (a reminder without a pet shows this instead of a pet face).
export const REMINDER_ICON = {
  vaccination: 'needle',
  medication: 'pill',
  activity: 'run',
  custom: 'bell-ring-outline',
};

export const reminderIcon = (type) => REMINDER_ICON[type] ?? 'bell-outline';
