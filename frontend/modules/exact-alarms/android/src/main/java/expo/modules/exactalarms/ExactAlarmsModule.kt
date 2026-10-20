package expo.modules.exactalarms

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Whether Android lets the app schedule exact alarms, and a way to the screen
// where the user allows it (CHW-244). expo-notifications already schedules
// exactly when this is allowed (setExactAndAllowWhileIdle), and approximately
// otherwise; this module only reports and opens the setting.
class ExactAlarmsModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("ExactAlarms")

    // Always true before Android 12 (API 31), where exact alarms need no permission.
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        true
      } else {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
      }
    }

    // Opens this app's "Alarms & reminders" page. False where there is none.
    Function("openSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        false
      } else {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
      }
    }
  }
}
